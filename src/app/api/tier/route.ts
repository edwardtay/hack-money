import { NextRequest, NextResponse } from 'next/server'
import { FEE_TIERS, getNextTierInfo, YIELD_SHARE_RATE, formatVolume } from '@/lib/incentives/fee-tiers'
import { getVolumeRecord, getLeaderboard } from '@/lib/incentives/volume-tracker'

/**
 * GET /api/tier?address=vitalik.eth
 *
 * Returns fee tier info for a receiver:
 * - Current tier and fee rate
 * - Progress to next tier
 * - Monthly volume stats
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')

  // If no address, return tier structure
  if (!address) {
    return NextResponse.json({
      tiers: FEE_TIERS.map(t => ({
        name: t.name,
        feePercent: t.feePercent,
        minVolume: formatVolume(t.minVolume),
        savings: t.savings,
      })),
      yieldShareRate: `${YIELD_SHARE_RATE * 100}%`,
      gasTankBonus: 'Fee waived when gas tank is funded',
    })
  }

  // Get tier info for specific address
  const volumeRecord = getVolumeRecord(address)
  const tierInfo = getNextTierInfo(volumeRecord.monthlyVolumeUsd)

  return NextResponse.json({
    address,
    tier: {
      name: tierInfo.currentTier.name,
      feePercent: tierInfo.currentTier.feePercent,
      feeRate: tierInfo.currentTier.feeRate,
      color: tierInfo.currentTier.color,
    },
    volume: {
      monthly: volumeRecord.monthlyVolumeUsd,
      monthlyFormatted: formatVolume(volumeRecord.monthlyVolumeUsd),
      total: volumeRecord.totalVolumeUsd,
      totalFormatted: formatVolume(volumeRecord.totalVolumeUsd),
      paymentCount: volumeRecord.paymentCount,
    },
    progress: {
      nextTier: tierInfo.nextTier?.name || null,
      nextTierFee: tierInfo.nextTier?.feePercent || null,
      volumeToNextTier: tierInfo.volumeToNextTier,
      volumeToNextTierFormatted: formatVolume(tierInfo.volumeToNextTier),
      percentComplete: Math.round(tierInfo.percentToNextTier),
    },
    incentives: {
      yieldShareRate: `${YIELD_SHARE_RATE * 100}%`,
      gasTankBonus: 'Fund gas tank to waive protocol fees for your payers',
    },
  })
}

/**
 * GET /api/tier/leaderboard
 *
 * Returns top receivers by volume
 */
export async function POST(req: NextRequest) {
  const { action } = await req.json()

  if (action === 'leaderboard') {
    const leaderboard = getLeaderboard()
    return NextResponse.json({
      leaderboard: leaderboard.map((r, i) => ({
        rank: i + 1,
        address: r.address,
        tier: r.tier,
        volume: formatVolume(r.monthlyVolumeUsd),
        payments: r.paymentCount,
      })),
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
