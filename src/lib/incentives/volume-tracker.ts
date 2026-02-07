/**
 * Volume Tracker
 *
 * Tracks monthly payment volume per receiver for fee tier calculation.
 * In production, this would be a database. For hackathon, in-memory + localStorage.
 */

import { getFeeTier, type FeeTier } from './fee-tiers'

interface VolumeRecord {
  address: string
  monthlyVolumeUsd: number
  totalVolumeUsd: number
  paymentCount: number
  lastPaymentAt: string
  tier: string
}

// In-memory store (resets on server restart)
const volumeStore = new Map<string, VolumeRecord>()

// Demo data for showcasing tiers
const DEMO_VOLUMES: Record<string, number> = {
  'vitalik.eth': 150_000,     // Enterprise tier
  'edwardtay.eth': 50_000,    // Pro tier
  'alice.eth': 5_000,         // Growth tier
  'bob.eth': 500,             // Starter tier
}

/**
 * Get volume record for a receiver
 */
export function getVolumeRecord(addressOrEns: string): VolumeRecord {
  const key = addressOrEns.toLowerCase()

  // Check if already tracked
  if (volumeStore.has(key)) {
    return volumeStore.get(key)!
  }

  // Check demo data
  const demoVolume = DEMO_VOLUMES[key] || 0
  const tier = getFeeTier(demoVolume)

  const record: VolumeRecord = {
    address: addressOrEns,
    monthlyVolumeUsd: demoVolume,
    totalVolumeUsd: demoVolume,
    paymentCount: demoVolume > 0 ? Math.floor(demoVolume / 100) : 0,
    lastPaymentAt: new Date().toISOString(),
    tier: tier.name,
  }

  volumeStore.set(key, record)
  return record
}

/**
 * Record a payment and update volume
 */
export function recordPayment(params: {
  receiver: string
  amountUsd: number
  txHash: string
}): VolumeRecord {
  const { receiver, amountUsd } = params
  const key = receiver.toLowerCase()

  const existing = getVolumeRecord(key)
  const newMonthlyVolume = existing.monthlyVolumeUsd + amountUsd
  const tier = getFeeTier(newMonthlyVolume)

  const updated: VolumeRecord = {
    ...existing,
    monthlyVolumeUsd: newMonthlyVolume,
    totalVolumeUsd: existing.totalVolumeUsd + amountUsd,
    paymentCount: existing.paymentCount + 1,
    lastPaymentAt: new Date().toISOString(),
    tier: tier.name,
  }

  volumeStore.set(key, updated)
  return updated
}

/**
 * Get tier info for a receiver
 */
export function getReceiverTier(addressOrEns: string): {
  record: VolumeRecord
  tier: FeeTier
  nextTier: FeeTier | null
  volumeToNextTier: number
} {
  const record = getVolumeRecord(addressOrEns)
  const tier = getFeeTier(record.monthlyVolumeUsd)

  // Find next tier
  const tiers = [
    { name: 'Starter', min: 0 },
    { name: 'Growth', min: 1000 },
    { name: 'Pro', min: 10000 },
    { name: 'Enterprise', min: 100000 },
  ]

  const currentIdx = tiers.findIndex(t => t.name === tier.name)
  const nextTierInfo = currentIdx < tiers.length - 1 ? tiers[currentIdx + 1] : null

  return {
    record,
    tier,
    nextTier: nextTierInfo ? getFeeTier(nextTierInfo.min) : null,
    volumeToNextTier: nextTierInfo ? nextTierInfo.min - record.monthlyVolumeUsd : 0,
  }
}

/**
 * Check if receiver has funded gas tank
 */
export async function hasGasTank(address: string): Promise<boolean> {
  // In production, check GasTankRegistry contract
  // For hackathon, return false (can be enhanced)
  return false
}

/**
 * Leaderboard for demo
 */
export function getLeaderboard(): VolumeRecord[] {
  // Include demo data
  Object.keys(DEMO_VOLUMES).forEach(getVolumeRecord)

  return Array.from(volumeStore.values())
    .sort((a, b) => b.monthlyVolumeUsd - a.monthlyVolumeUsd)
    .slice(0, 10)
}
