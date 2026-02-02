// ---------------------------------------------------------------------------
// Circle Developer-Controlled Wallets
// ---------------------------------------------------------------------------

const CIRCLE_W3S_BASE = 'https://api.circle.com/v1/w3s'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CircleWallet = {
  id: string
  address: string
  blockchain: string
  state: 'LIVE' | 'PENDING' | 'FROZEN'
  createDate: string
  updateDate: string
}

export type CircleWalletSet = {
  id: string
  custodyType: 'DEVELOPER'
  name: string
  updateDate: string
  createDate: string
}

export type PaymentAuthorization = {
  walletId: string
  recipient: string
  amount: string
  token: string
  chain: string
  idempotencyKey: string
}

export type SignedPayment = {
  id: string
  walletId: string
  transactionHash?: string
  state: 'INITIATED' | 'PENDING' | 'CONFIRMED' | 'FAILED'
  amounts: string[]
  createDate: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.CIRCLE_API_KEY
  if (!key) {
    throw new Error(
      'CIRCLE_API_KEY environment variable is not set. ' +
      'Obtain one from https://console.circle.com'
    )
  }
  return key
}

function headers(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getApiKey()}`,
  }
}

/** Generate a UUID v4-style idempotency key */
function generateIdempotencyKey(): string {
  return crypto.randomUUID()
}

// ---------------------------------------------------------------------------
// Wallet Set management
// ---------------------------------------------------------------------------

/**
 * Create or retrieve the agent's wallet set.
 * A wallet set is a logical grouping of wallets under the developer account.
 */
async function ensureWalletSet(name: string = 'payagent-wallets'): Promise<CircleWalletSet> {
  // List existing wallet sets to check if ours already exists
  const listRes = await fetch(`${CIRCLE_W3S_BASE}/developer/walletSets`, {
    method: 'GET',
    headers: headers(),
  })

  if (listRes.ok) {
    const listData = (await listRes.json()) as {
      data: { walletSets: CircleWalletSet[] }
    }
    const existing = listData.data.walletSets.find((ws) => ws.name === name)
    if (existing) return existing
  }

  // Create a new wallet set
  const res = await fetch(`${CIRCLE_W3S_BASE}/developer/walletSets`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      idempotencyKey: generateIdempotencyKey(),
      name,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to create wallet set: ${res.status} ${text}`)
  }

  const data = (await res.json()) as { data: { walletSet: CircleWalletSet } }
  return data.data.walletSet
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create (or retrieve) a developer-controlled wallet for the AI agent.
 *
 * This uses Circle's Programmable Wallets API to create a wallet that
 * the server can sign transactions with -- no user interaction needed.
 *
 * @param blockchain - Target blockchain, e.g. "ETH-SEPOLIA", "ETH", "ARB", "BASE"
 * @returns The wallet details including address
 */
export async function createAgentWallet(
  blockchain: string = 'ETH-SEPOLIA'
): Promise<CircleWallet> {
  const walletSet = await ensureWalletSet()

  // Check for existing wallets in this set
  const listRes = await fetch(
    `${CIRCLE_W3S_BASE}/developer/wallets?walletSetId=${walletSet.id}`,
    {
      method: 'GET',
      headers: headers(),
    }
  )

  if (listRes.ok) {
    const listData = (await listRes.json()) as {
      data: { wallets: CircleWallet[] }
    }
    const existing = listData.data.wallets.find(
      (w) => w.blockchain === blockchain && w.state === 'LIVE'
    )
    if (existing) return existing
  }

  // Create a new wallet
  const res = await fetch(`${CIRCLE_W3S_BASE}/developer/wallets`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      idempotencyKey: generateIdempotencyKey(),
      walletSetId: walletSet.id,
      blockchains: [blockchain],
      count: 1,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to create wallet: ${res.status} ${text}`)
  }

  const data = (await res.json()) as { data: { wallets: CircleWallet[] } }
  const wallet = data.data.wallets[0]

  if (!wallet) {
    throw new Error('Circle API returned empty wallet array')
  }

  return wallet
}

/**
 * Sign and submit a payment authorization from a developer-controlled wallet.
 *
 * This initiates a USDC transfer from the agent's wallet to a recipient
 * address. Circle handles the signing on the server side.
 *
 * @param walletId   - The Circle wallet ID to send from
 * @param payment    - Payment details (recipient, amount, token, chain)
 * @returns The transaction result with state and optional hash
 */
export async function signPayment(
  walletId: string,
  payment: Omit<PaymentAuthorization, 'walletId' | 'idempotencyKey'>
): Promise<SignedPayment> {
  // Map our chain names to Circle token IDs
  const tokenId = resolveCircleTokenId(payment.token, payment.chain)

  const res = await fetch(
    `${CIRCLE_W3S_BASE}/developer/wallets/${walletId}/transactions/transfer`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        idempotencyKey: generateIdempotencyKey(),
        amounts: [payment.amount],
        destinationAddress: payment.recipient,
        tokenId,
        feeLevel: 'MEDIUM',
      }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to sign payment: ${res.status} ${text}`)
  }

  const data = (await res.json()) as { data: { transfer: SignedPayment } }
  return data.data.transfer
}

/**
 * Check the status of a previously submitted transaction.
 */
export async function getTransactionStatus(
  transactionId: string
): Promise<SignedPayment> {
  const res = await fetch(
    `${CIRCLE_W3S_BASE}/developer/transactions/${transactionId}`,
    {
      method: 'GET',
      headers: headers(),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to get transaction: ${res.status} ${text}`)
  }

  const data = (await res.json()) as { data: { transaction: SignedPayment } }
  return data.data.transaction
}

// ---------------------------------------------------------------------------
// Internal: Token ID resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a token symbol + chain to a Circle token UUID.
 *
 * Circle's API uses UUIDs for tokens. In production these would be fetched
 * from the /tokens endpoint. For now we map the common ones.
 */
function resolveCircleTokenId(token: string, chain: string): string {
  // Circle token IDs for USDC on various chains
  // These are well-known IDs from Circle's documentation
  const TOKEN_IDS: Record<string, Record<string, string>> = {
    USDC: {
      ethereum: '36b6931a-873a-56a8-8a27-f00571a37104',
      arbitrum: '8c4ea8a5-8a7e-5012-a7c8-3b3e1e5d42f1',
      base: 'e4f1f110-34c9-5811-8b58-d1c5b3e1e342',
      optimism: '2b92315d-eab7-5bef-84fa-089a731a2e1c',
      'ETH-SEPOLIA': '979869da-9115-5f7d-917d-12d434e56ae7',
    },
  }

  const upperToken = token.toUpperCase()
  const lowerChain = chain.toLowerCase()

  const id = TOKEN_IDS[upperToken]?.[lowerChain]
  if (!id) {
    throw new Error(
      `No Circle token ID for ${upperToken} on ${chain}. ` +
      `Supported: ${Object.keys(TOKEN_IDS[upperToken] ?? {}).join(', ')}`
    )
  }

  return id
}
