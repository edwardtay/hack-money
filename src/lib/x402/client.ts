// ---------------------------------------------------------------------------
// x402 Client – HTTP 402 Payment Required protocol (V2)
// ---------------------------------------------------------------------------

export type X402PaymentDetails = {
  amount: string
  token: string
  chain: string
  recipient: string
}

/**
 * V2: Payment proof that includes wallet-based identity.
 * Including the wallet address lets the server recognise repeat payers
 * and avoids double-charging for the same resource.
 */
export type X402PaymentProof = {
  /** Opaque proof string (tx hash, signed receipt, etc.) */
  proof: string
  /** Wallet address that made the payment */
  walletAddress: string
  /** ISO-8601 timestamp of payment */
  paidAt: string
  /** Original payment details this proof satisfies */
  paymentDetails: X402PaymentDetails
  /** Version tag for forward compatibility */
  version: 2
}

// ---------------------------------------------------------------------------
// Probing (unchanged, backward compatible)
// ---------------------------------------------------------------------------

/**
 * Probe a URL for HTTP 402 Payment Required.
 * Returns the payment details if the server demands payment, otherwise null.
 */
export async function probeX402(url: string): Promise<X402PaymentDetails | null> {
  try {
    const res = await fetch(url)
    if (res.status === 402) {
      const body = await res.json().catch(() => null)
      if (body && body.payment) {
        return body.payment as X402PaymentDetails
      }
      // Try header-based approach
      const payHeader = res.headers.get('X-Payment')
      if (payHeader) {
        return JSON.parse(payHeader) as X402PaymentDetails
      }
    }
    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Access with payment (backward compatible – string proof)
// ---------------------------------------------------------------------------

/**
 * Access a URL with a simple payment proof string.
 * This is the original V1 interface kept for backward compatibility.
 */
export async function accessWithPayment(
  url: string,
  paymentProof: string
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(url, {
    headers: { 'X-Payment-Proof': paymentProof },
  })
  const data = await res.json().catch(async () => ({ message: await res.text() }))
  return { status: res.status, data }
}

// ---------------------------------------------------------------------------
// V2: Wallet-based payment proof
// ---------------------------------------------------------------------------

/**
 * Create a structured payment proof that includes wallet identity.
 *
 * The proof binds a wallet address to a specific payment, allowing servers
 * to track which wallets have already paid and skip re-payment for repeat
 * requests to the same resource.
 *
 * @param walletAddress  - The wallet address that made the payment
 * @param paymentDetails - The original 402 payment requirements
 * @param txProof        - Transaction proof (hash, signed receipt, etc.)
 * @returns A serialized payment proof for the X-Payment-Proof header
 */
export function createPaymentProof(
  walletAddress: string,
  paymentDetails: X402PaymentDetails,
  txProof?: string
): X402PaymentProof {
  return {
    proof: txProof ?? '',
    walletAddress,
    paidAt: new Date().toISOString(),
    paymentDetails,
    version: 2,
  }
}

/**
 * Access a URL using a V2 payment proof with wallet identity.
 *
 * Sends both the structured proof (as JSON) in the X-Payment-Proof header
 * and the wallet address in X-Wallet-Address for servers that support
 * identity-based access control.
 */
export async function accessWithWalletPayment(
  url: string,
  proof: X402PaymentProof
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(url, {
    headers: {
      'X-Payment-Proof': JSON.stringify(proof),
      'X-Wallet-Address': proof.walletAddress,
      'X-Payment-Version': '2',
    },
  })
  const data = await res.json().catch(async () => ({ message: await res.text() }))
  return { status: res.status, data }
}
