/**
 * FlowFi Referral System
 *
 * Referrers earn 50% of protocol fees from referred users for 6 months.
 * This incentivizes network growth, not just network membership.
 *
 * Example:
 * - Alice refers Bob
 * - Bob receives $10,000/month at Growth tier (0.10% fee = $10/month)
 * - Alice earns $5/month from Bob's activity for 6 months
 * - Total referral earnings: $30
 */

export interface Referral {
  referrer: string        // ENS or address of referrer
  referred: string        // ENS or address of referred user
  createdAt: number       // Timestamp when referral was created
  expiresAt: number       // Timestamp when referral rewards expire
  totalEarned: number     // Total USD earned from this referral
  isActive: boolean       // Whether referral is still earning
}

export interface ReferrerStats {
  address: string
  totalReferrals: number
  activeReferrals: number
  totalEarned: number
  monthlyEarnings: number
  referrals: Referral[]
}

// Referral configuration
export const REFERRAL_FEE_SHARE = 0.50      // 50% of protocol fee
export const REFERRAL_DURATION_MS = 6 * 30 * 24 * 60 * 60 * 1000  // 6 months

// In-memory referral store (in production, use database)
const referrals = new Map<string, Referral>()  // referred -> referral
const referrerIndex = new Map<string, Set<string>>()  // referrer -> Set<referred>

// Demo data
function initDemoData() {
  if (referrals.size > 0) return

  const now = Date.now()
  const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000

  // vitalik.eth referred alice.eth and bob.eth
  registerReferral('vitalik.eth', 'alice.eth', oneMonthAgo)
  registerReferral('vitalik.eth', 'bob.eth', oneMonthAgo)

  // Record some earnings
  recordReferralEarning('alice.eth', 25)  // $25 earned from alice
  recordReferralEarning('bob.eth', 15)    // $15 earned from bob
}

/**
 * Register a new referral
 */
export function registerReferral(
  referrer: string,
  referred: string,
  timestamp?: number
): { success: boolean; error?: string } {
  const normalizedReferrer = referrer.toLowerCase()
  const normalizedReferred = referred.toLowerCase()

  // Can't refer yourself
  if (normalizedReferrer === normalizedReferred) {
    return { success: false, error: 'Cannot refer yourself' }
  }

  // Check if already referred
  if (referrals.has(normalizedReferred)) {
    return { success: false, error: 'User already has a referrer' }
  }

  const now = timestamp || Date.now()
  const referral: Referral = {
    referrer: normalizedReferrer,
    referred: normalizedReferred,
    createdAt: now,
    expiresAt: now + REFERRAL_DURATION_MS,
    totalEarned: 0,
    isActive: true,
  }

  referrals.set(normalizedReferred, referral)

  // Update referrer index
  if (!referrerIndex.has(normalizedReferrer)) {
    referrerIndex.set(normalizedReferrer, new Set())
  }
  referrerIndex.get(normalizedReferrer)!.add(normalizedReferred)

  return { success: true }
}

/**
 * Get referrer for a user (if any)
 */
export function getReferrer(referred: string): string | null {
  initDemoData()
  const referral = referrals.get(referred.toLowerCase())
  if (!referral) return null

  // Check if still active
  if (Date.now() > referral.expiresAt) {
    referral.isActive = false
    return null
  }

  return referral.referrer
}

/**
 * Calculate referral reward from a payment fee
 */
export function calculateReferralReward(
  receiverAddress: string,
  protocolFeeUsd: number
): {
  referrer: string | null
  referralReward: number
  netProtocolFee: number
} {
  initDemoData()
  const referrer = getReferrer(receiverAddress)

  if (!referrer || protocolFeeUsd <= 0) {
    return {
      referrer: null,
      referralReward: 0,
      netProtocolFee: protocolFeeUsd,
    }
  }

  const referralReward = protocolFeeUsd * REFERRAL_FEE_SHARE
  const netProtocolFee = protocolFeeUsd - referralReward

  return {
    referrer,
    referralReward,
    netProtocolFee,
  }
}

/**
 * Record earnings from a referral (called after payment)
 */
export function recordReferralEarning(
  referred: string,
  earnedUsd: number
): void {
  const referral = referrals.get(referred.toLowerCase())
  if (referral && referral.isActive) {
    referral.totalEarned += earnedUsd
  }
}

/**
 * Get referrer stats
 */
export function getReferrerStats(referrer: string): ReferrerStats {
  initDemoData()
  const normalizedReferrer = referrer.toLowerCase()
  const referredSet = referrerIndex.get(normalizedReferrer) || new Set()

  const referralList: Referral[] = []
  let totalEarned = 0
  let activeCount = 0

  for (const referred of referredSet) {
    const referral = referrals.get(referred)
    if (referral) {
      // Update active status
      if (Date.now() > referral.expiresAt) {
        referral.isActive = false
      }

      referralList.push(referral)
      totalEarned += referral.totalEarned
      if (referral.isActive) activeCount++
    }
  }

  // Estimate monthly earnings from active referrals
  const monthlyEarnings = referralList
    .filter(r => r.isActive)
    .reduce((sum, r) => {
      const monthsActive = Math.max(1, (Date.now() - r.createdAt) / (30 * 24 * 60 * 60 * 1000))
      return sum + (r.totalEarned / monthsActive)
    }, 0)

  return {
    address: normalizedReferrer,
    totalReferrals: referralList.length,
    activeReferrals: activeCount,
    totalEarned,
    monthlyEarnings,
    referrals: referralList,
  }
}

/**
 * Generate referral link/code
 */
export function generateReferralCode(referrer: string): string {
  // Simple base64 encoding of referrer address
  // In production, use shorter codes with database lookup
  return Buffer.from(referrer.toLowerCase()).toString('base64url')
}

/**
 * Decode referral code to get referrer
 */
export function decodeReferralCode(code: string): string | null {
  try {
    return Buffer.from(code, 'base64url').toString('utf8')
  } catch {
    return null
  }
}

/**
 * Format referral stats for display
 */
export function formatReferralStats(stats: ReferrerStats): {
  summary: string
  earnings: string
  activeReferrals: string
} {
  return {
    summary: `${stats.totalReferrals} referrals (${stats.activeReferrals} active)`,
    earnings: `$${stats.totalEarned.toFixed(2)} earned ($${stats.monthlyEarnings.toFixed(2)}/mo)`,
    activeReferrals: stats.referrals
      .filter(r => r.isActive)
      .map(r => r.referred)
      .join(', ') || 'None',
  }
}
