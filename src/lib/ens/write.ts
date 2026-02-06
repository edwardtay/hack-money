import { createPublicClient, encodeFunctionData, http, namehash, keccak256, toHex, labelhash } from 'viem'
import { normalize } from 'viem/ens'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ETH_RPC_URL || 'https://eth.llamarpc.com'),
})

// ENS contracts on mainnet
const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const
const PUBLIC_RESOLVER = '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63' as const

const resolverAbi = [
  {
    name: 'setText',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    outputs: [],
  },
  {
    name: 'multicall',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'data', type: 'bytes[]' }],
    outputs: [{ name: 'results', type: 'bytes[]' }],
  },
] as const

// ENS Registry ABI for subdomain creation
const registryAbi = [
  {
    name: 'setSubnodeRecord',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'label', type: 'bytes32' },
      { name: 'owner', type: 'address' },
      { name: 'resolver', type: 'address' },
      { name: 'ttl', type: 'uint64' },
    ],
    outputs: [],
  },
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

/**
 * Build transaction data that writes com.payagent.token and com.payagent.chain
 * text records on the user's ENS resolver via a single multicall.
 */
export async function buildSetPreferenceTransaction(
  ensName: string,
  token: string,
  chain: string,
): Promise<{ to: string; data: string; value: string; chainId: number }> {
  const normalized = normalize(ensName)
  const node = namehash(normalized)

  const resolverAddress = await client.getEnsResolver({ name: normalized })
  if (!resolverAddress) {
    throw new Error(`No resolver found for ${ensName}`)
  }

  const setTokenData = encodeFunctionData({
    abi: resolverAbi,
    functionName: 'setText',
    args: [node, 'com.payagent.token', token],
  })

  const setChainData = encodeFunctionData({
    abi: resolverAbi,
    functionName: 'setText',
    args: [node, 'com.payagent.chain', chain],
  })

  const data = encodeFunctionData({
    abi: resolverAbi,
    functionName: 'multicall',
    args: [[setTokenData, setChainData]],
  })

  return {
    to: resolverAddress,
    data,
    value: '0',
    chainId: 1,
  }
}

/**
 * Build transaction data that writes yieldroute.vault text record
 * on the user's ENS resolver.
 */
export async function buildSetYieldVaultTransaction(
  ensName: string,
  vaultAddress: string,
): Promise<{ to: string; data: string; value: string; chainId: number }> {
  const normalized = normalize(ensName)
  const node = namehash(normalized)

  const resolverAddress = await client.getEnsResolver({ name: normalized })
  if (!resolverAddress) {
    throw new Error(`No resolver found for ${ensName}`)
  }

  const data = encodeFunctionData({
    abi: resolverAbi,
    functionName: 'setText',
    args: [node, 'yieldroute.vault', vaultAddress],
  })

  return {
    to: resolverAddress,
    data,
    value: '0',
    chainId: 1,
  }
}

/**
 * Build transaction data that writes flowfi.strategy text record
 * on the user's ENS resolver.
 */
export async function buildSetStrategyTransaction(
  ensName: string,
  strategy: string,
): Promise<{ to: string; data: string; value: string; chainId: number }> {
  const normalized = normalize(ensName)
  const node = namehash(normalized)

  const resolverAddress = await client.getEnsResolver({ name: normalized })
  if (!resolverAddress) {
    throw new Error(`No resolver found for ${ensName}`)
  }

  const data = encodeFunctionData({
    abi: resolverAbi,
    functionName: 'setText',
    args: [node, 'flowfi.strategy', strategy],
  })

  return {
    to: resolverAddress,
    data,
    value: '0',
    chainId: 1,
  }
}

/**
 * Build transaction data that writes both flowfi.strategy and yieldroute.vault
 * text records on the user's ENS resolver via a single multicall.
 */
export async function buildSetStrategyAndVaultTransaction(
  ensName: string,
  strategy: string,
  vaultAddress?: string,
): Promise<{ to: string; data: string; value: string; chainId: number }> {
  const normalized = normalize(ensName)
  const node = namehash(normalized)

  const resolverAddress = await client.getEnsResolver({ name: normalized })
  if (!resolverAddress) {
    throw new Error(`No resolver found for ${ensName}`)
  }

  const calls: `0x${string}`[] = []

  // Always set strategy
  calls.push(
    encodeFunctionData({
      abi: resolverAbi,
      functionName: 'setText',
      args: [node, 'flowfi.strategy', strategy],
    })
  )

  // Optionally set vault (only for yield strategy)
  if (vaultAddress) {
    calls.push(
      encodeFunctionData({
        abi: resolverAbi,
        functionName: 'setText',
        args: [node, 'yieldroute.vault', vaultAddress],
      })
    )
  }

  const data = calls.length === 1
    ? calls[0]
    : encodeFunctionData({
        abi: resolverAbi,
        functionName: 'multicall',
        args: [calls],
      })

  return {
    to: resolverAddress,
    data,
    value: '0',
    chainId: 1,
  }
}

/**
 * Build transaction data that writes flowfi.strategies text record
 * for multi-strategy allocation (e.g., "yield:50,restaking:50").
 */
export async function buildSetStrategiesTransaction(
  ensName: string,
  strategies: string,
): Promise<{ to: string; data: string; value: string; chainId: number }> {
  const normalized = normalize(ensName)
  const node = namehash(normalized)

  const resolverAddress = await client.getEnsResolver({ name: normalized })
  if (!resolverAddress) {
    throw new Error(`No resolver found for ${ensName}`)
  }

  const data = encodeFunctionData({
    abi: resolverAbi,
    functionName: 'setText',
    args: [node, 'flowfi.strategies', strategies],
  })

  return {
    to: resolverAddress,
    data,
    value: '0',
    chainId: 1,
  }
}

/**
 * Build transaction data that writes multiple strategy-related records
 * via a single multicall: flowfi.strategies, flowfi.strategy, yieldroute.vault
 */
export async function buildSetMultiStrategyTransaction(
  ensName: string,
  options: {
    strategies?: string // Multi-strategy: "yield:50,restaking:50"
    strategy?: string // Single strategy fallback
    vaultAddress?: string
  },
): Promise<{ to: string; data: string; value: string; chainId: number }> {
  const normalized = normalize(ensName)
  const node = namehash(normalized)

  const resolverAddress = await client.getEnsResolver({ name: normalized })
  if (!resolverAddress) {
    throw new Error(`No resolver found for ${ensName}`)
  }

  const calls: `0x${string}`[] = []

  // Set multi-strategy allocation if provided
  if (options.strategies) {
    calls.push(
      encodeFunctionData({
        abi: resolverAbi,
        functionName: 'setText',
        args: [node, 'flowfi.strategies', options.strategies],
      })
    )
  }

  // Set single strategy if provided
  if (options.strategy) {
    calls.push(
      encodeFunctionData({
        abi: resolverAbi,
        functionName: 'setText',
        args: [node, 'flowfi.strategy', options.strategy],
      })
    )
  }

  // Set vault address if provided
  if (options.vaultAddress) {
    calls.push(
      encodeFunctionData({
        abi: resolverAbi,
        functionName: 'setText',
        args: [node, 'yieldroute.vault', options.vaultAddress],
      })
    )
  }

  if (calls.length === 0) {
    throw new Error('At least one option must be provided')
  }

  const data = calls.length === 1
    ? calls[0]
    : encodeFunctionData({
        abi: resolverAbi,
        functionName: 'multicall',
        args: [calls],
      })

  return {
    to: resolverAddress,
    data,
    value: '0',
    chainId: 1,
  }
}

/**
 * Invoice data structure for ENS storage
 */
export interface InvoiceData {
  id: string
  amount: string
  token: string
  memo?: string
  createdAt: string
  expiresAt?: string
}

/**
 * Compute a deterministic hash of invoice data for ENS storage.
 * This allows verification without storing full invoice on-chain.
 */
export function computeInvoiceHash(invoice: InvoiceData): string {
  const payload = JSON.stringify({
    id: invoice.id,
    amount: invoice.amount,
    token: invoice.token,
    memo: invoice.memo || '',
    createdAt: invoice.createdAt,
  })
  return keccak256(toHex(payload))
}

/**
 * Build transaction data that writes an invoice hash to ENS text record.
 * Record key: flowfi.invoice.{id}
 * Record value: {hash}:{amount}:{token} (compact format for verification)
 */
export async function buildSetInvoiceTransaction(
  ensName: string,
  invoice: InvoiceData,
): Promise<{ to: string; data: string; value: string; chainId: number; invoiceHash: string }> {
  const normalized = normalize(ensName)
  const node = namehash(normalized)

  const resolverAddress = await client.getEnsResolver({ name: normalized })
  if (!resolverAddress) {
    throw new Error(`No resolver found for ${ensName}`)
  }

  const invoiceHash = computeInvoiceHash(invoice)
  const recordKey = `flowfi.invoice.${invoice.id}`
  // Compact format: hash:amount:token (allows basic verification without full data)
  const recordValue = `${invoiceHash}:${invoice.amount}:${invoice.token}`

  const data = encodeFunctionData({
    abi: resolverAbi,
    functionName: 'setText',
    args: [node, recordKey, recordValue],
  })

  return {
    to: resolverAddress,
    data,
    value: '0',
    chainId: 1,
    invoiceHash,
  }
}

/**
 * Read an invoice hash from ENS text record.
 * Returns null if not found.
 */
export async function getInvoiceFromENS(
  ensName: string,
  invoiceId: string,
): Promise<{ hash: string; amount: string; token: string } | null> {
  try {
    const normalized = normalize(ensName)
    const recordKey = `flowfi.invoice.${invoiceId}`

    const value = await client.getEnsText({ name: normalized, key: recordKey })
    if (!value) return null

    // Parse compact format: hash:amount:token
    const [hash, amount, token] = value.split(':')
    if (!hash || !amount || !token) return null

    return { hash, amount, token }
  } catch {
    return null
  }
}

/**
 * Verify an invoice against its ENS record.
 * Returns true if the invoice data matches the stored hash.
 */
export function verifyInvoice(invoice: InvoiceData, storedHash: string): boolean {
  const computedHash = computeInvoiceHash(invoice)
  return computedHash === storedHash
}

/**
 * Build transaction to create an invoice subdomain.
 * Creates: inv-{id}.yourname.eth with invoice data in text records.
 *
 * This demonstrates deeper ENS integration by creating actual subdomains
 * rather than just storing data in text records on the parent name.
 */
export async function buildCreateInvoiceSubdomainTransaction(
  ensName: string,
  invoice: InvoiceData,
  ownerAddress: string,
): Promise<{
  transactions: Array<{ to: string; data: string; value: string; chainId: number; description: string }>
  subdomain: string
  invoiceHash: string
}> {
  const normalized = normalize(ensName)
  const parentNode = namehash(normalized)

  // Create subdomain label: inv-{id}
  const subdomainLabel = `inv-${invoice.id}`
  const subdomain = `${subdomainLabel}.${normalized}`
  const subdomainNode = namehash(subdomain)
  const label = labelhash(subdomainLabel)

  const invoiceHash = computeInvoiceHash(invoice)

  // Transaction 1: Create subdomain via ENS Registry
  const createSubdomainData = encodeFunctionData({
    abi: registryAbi,
    functionName: 'setSubnodeRecord',
    args: [
      parentNode,
      label,
      ownerAddress as `0x${string}`,
      PUBLIC_RESOLVER,
      BigInt(0), // TTL
    ],
  })

  // Transaction 2: Set invoice data on subdomain resolver
  // Compact format: hash:amount:token:memo
  const invoiceValue = [
    invoiceHash,
    invoice.amount,
    invoice.token,
    invoice.memo || '',
    invoice.expiresAt || '',
  ].join(':')

  const setTextData = encodeFunctionData({
    abi: resolverAbi,
    functionName: 'setText',
    args: [subdomainNode, 'flowfi.invoice', invoiceValue],
  })

  return {
    transactions: [
      {
        to: ENS_REGISTRY,
        data: createSubdomainData,
        value: '0',
        chainId: 1,
        description: `Create subdomain: ${subdomain}`,
      },
      {
        to: PUBLIC_RESOLVER,
        data: setTextData,
        value: '0',
        chainId: 1,
        description: `Set invoice data on ${subdomain}`,
      },
    ],
    subdomain,
    invoiceHash,
  }
}

/**
 * Read invoice data from a subdomain.
 * Reads from: inv-{id}.yourname.eth
 */
export async function getInvoiceFromSubdomain(
  ensName: string,
  invoiceId: string,
): Promise<{
  hash: string
  amount: string
  token: string
  memo?: string
  expiresAt?: string
  subdomain: string
} | null> {
  try {
    const normalized = normalize(ensName)
    const subdomain = `inv-${invoiceId}.${normalized}`

    const value = await client.getEnsText({ name: subdomain, key: 'flowfi.invoice' })
    if (!value) return null

    // Parse compact format: hash:amount:token:memo:expiresAt
    const [hash, amount, token, memo, expiresAt] = value.split(':')
    if (!hash || !amount || !token) return null

    return {
      hash,
      amount,
      token,
      memo: memo || undefined,
      expiresAt: expiresAt || undefined,
      subdomain,
    }
  } catch {
    return null
  }
}

/**
 * Check if a subdomain exists by querying its owner.
 */
export async function subdomainExists(subdomain: string): Promise<boolean> {
  try {
    const node = namehash(normalize(subdomain))
    const owner = await client.readContract({
      address: ENS_REGISTRY,
      abi: registryAbi,
      functionName: 'owner',
      args: [node],
    })
    return owner !== '0x0000000000000000000000000000000000000000'
  } catch {
    return false
  }
}
