/**
 * Network Effects: Receiver-to-Receiver 0% Fee
 *
 * When both sender and receiver are ENSIO users:
 * - 0% protocol fee (internal transfer)
 * - Creates viral loop: more receivers = more free payments
 * - Ecosystem lock-in: leaving = paying fees again
 *
 * This is the missing piece for exponential growth.
 */

// In-memory store of ENSIO receivers (in production, this would be a database)
const ensioReceivers = new Set<string>([
  // Demo receivers (lowercase)
  'vitalik.eth',
  'edwardtay.eth',
  'alice.eth',
  'bob.eth',
  // Addresses
  '0xd8da6bf26964af9d7eed9e03e53415d37aa96045', // vitalik.eth
  '0x38430336153468dcf36af5cea7d6bc472425633a', // edwardtay.eth
])

/**
 * Check if an address/ENS is a registered ENSIO receiver
 */
export function isEnsioReceiver(addressOrEns: string): boolean {
  return ensioReceivers.has(addressOrEns.toLowerCase())
}

/**
 * Register a new ENSIO receiver
 */
export function registerReceiver(addressOrEns: string): void {
  ensioReceivers.add(addressOrEns.toLowerCase())
}

/**
 * Get count of ENSIO receivers (for network stats)
 */
export function getReceiverCount(): number {
  return ensioReceivers.size
}

/**
 * Check if payment qualifies for 0% internal fee
 */
export function isInternalPayment(sender: string, receiver: string): {
  isInternal: boolean
  senderIsReceiver: boolean
  receiverIsReceiver: boolean
  discount: string
} {
  const senderIsReceiver = isEnsioReceiver(sender)
  const receiverIsReceiver = isEnsioReceiver(receiver)
  const isInternal = senderIsReceiver && receiverIsReceiver

  return {
    isInternal,
    senderIsReceiver,
    receiverIsReceiver,
    discount: isInternal ? '100%' : senderIsReceiver ? '50%' : '0%',
  }
}

/**
 * Calculate fee with network effects
 */
export function calculateNetworkFee(params: {
  baseFeeRate: number  // From tier system (e.g., 10 = 0.10%)
  sender: string
  receiver: string
  amountUsd: number
}): {
  feeRate: number
  feeAmount: number
  feePercent: string
  isInternal: boolean
  networkDiscount: string
  reason: string
} {
  const { baseFeeRate, sender, receiver, amountUsd } = params
  const internal = isInternalPayment(sender, receiver)

  // Internal payment: 0% fee
  if (internal.isInternal) {
    return {
      feeRate: 0,
      feeAmount: 0,
      feePercent: '0%',
      isInternal: true,
      networkDiscount: '100%',
      reason: 'ENSIO-to-ENSIO payment (0% fee)',
    }
  }

  // Sender is ENSIO receiver: 50% discount
  if (internal.senderIsReceiver) {
    const discountedRate = baseFeeRate / 2
    const feeAmount = (amountUsd * discountedRate) / 10_000
    return {
      feeRate: discountedRate,
      feeAmount,
      feePercent: `${(discountedRate / 100).toFixed(3)}%`,
      isInternal: false,
      networkDiscount: '50%',
      reason: 'ENSIO sender discount (50% off)',
    }
  }

  // Standard fee
  const feeAmount = (amountUsd * baseFeeRate) / 10_000
  return {
    feeRate: baseFeeRate,
    feeAmount,
    feePercent: `${(baseFeeRate / 100).toFixed(2)}%`,
    isInternal: false,
    networkDiscount: '0%',
    reason: 'Standard fee',
  }
}

/**
 * Network growth stats
 */
export function getNetworkStats(): {
  totalReceivers: number
  networkValue: string
  potentialFreePayments: string
} {
  const count = getReceiverCount()
  // Network value = n * (n-1) potential free payment pairs
  const pairs = count * (count - 1)

  return {
    totalReceivers: count,
    networkValue: `${pairs} free payment routes`,
    potentialFreePayments: pairs.toLocaleString(),
  }
}
