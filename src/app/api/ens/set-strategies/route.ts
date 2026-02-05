import { NextRequest, NextResponse } from 'next/server'
import { buildSetMultiStrategyTransaction } from '@/lib/ens/write'

/**
 * POST /api/ens/set-strategies
 *
 * Set multi-strategy allocation on ENS text records.
 * Supports setting flowfi.strategies (multi), flowfi.strategy (single), and yieldroute.vault
 * in a single transaction via multicall.
 *
 * Body:
 * - ensName: string (required) - ENS name to update
 * - strategies: string (optional) - Multi-strategy allocation: "yield:50,restaking:50"
 * - strategy: string (optional) - Single strategy: "yield" | "restaking" | "liquid"
 * - vaultAddress: string (optional) - ERC-4626 vault address on Base
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { ensName, strategies, strategy, vaultAddress } = body

    if (!ensName || typeof ensName !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid ensName' },
        { status: 400 }
      )
    }

    if (!strategies && !strategy && !vaultAddress) {
      return NextResponse.json(
        { error: 'At least one of strategies, strategy, or vaultAddress must be provided' },
        { status: 400 }
      )
    }

    // Validate strategies format if provided
    if (strategies) {
      const parts = strategies.split(',')
      let totalPercent = 0
      for (const part of parts) {
        const [strategyType, percentStr] = part.split(':')
        const percent = parseInt(percentStr, 10)
        if (!['yield', 'restaking', 'liquid'].includes(strategyType.trim().toLowerCase())) {
          return NextResponse.json(
            { error: `Invalid strategy type: ${strategyType}` },
            { status: 400 }
          )
        }
        if (isNaN(percent) || percent < 0 || percent > 100) {
          return NextResponse.json(
            { error: `Invalid percentage: ${percentStr}` },
            { status: 400 }
          )
        }
        totalPercent += percent
      }
      if (totalPercent !== 100) {
        return NextResponse.json(
          { error: `Allocations must sum to 100%, got ${totalPercent}%` },
          { status: 400 }
        )
      }
    }

    // Validate single strategy if provided
    if (strategy && !['yield', 'restaking', 'liquid'].includes(strategy.toLowerCase())) {
      return NextResponse.json(
        { error: `Invalid strategy: ${strategy}` },
        { status: 400 }
      )
    }

    // Validate vault address if provided
    if (vaultAddress && !/^0x[a-fA-F0-9]{40}$/.test(vaultAddress)) {
      return NextResponse.json(
        { error: 'Invalid vault address format' },
        { status: 400 }
      )
    }

    const tx = await buildSetMultiStrategyTransaction(ensName, {
      strategies,
      strategy,
      vaultAddress,
    })

    return NextResponse.json(tx)
  } catch (error) {
    console.error('Set strategies error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to build transaction' },
      { status: 500 }
    )
  }
}
