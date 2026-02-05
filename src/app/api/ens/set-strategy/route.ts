import { NextRequest, NextResponse } from 'next/server'
import { buildSetStrategyTransaction, buildSetStrategyAndVaultTransaction } from '@/lib/ens/write'

const VALID_STRATEGIES = ['yield', 'restaking']

export async function POST(request: NextRequest) {
  try {
    const { ensName, strategy, vaultAddress } = await request.json()

    if (!ensName || typeof ensName !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid ensName' },
        { status: 400 }
      )
    }

    if (!strategy || typeof strategy !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid strategy' },
        { status: 400 }
      )
    }

    // Validate strategy value
    if (!VALID_STRATEGIES.includes(strategy.toLowerCase())) {
      return NextResponse.json(
        { error: `Invalid strategy. Must be one of: ${VALID_STRATEGIES.join(', ')}` },
        { status: 400 }
      )
    }

    // If vault address provided, validate it
    if (vaultAddress && !/^0x[a-fA-F0-9]{40}$/.test(vaultAddress)) {
      return NextResponse.json(
        { error: 'Invalid vault address format' },
        { status: 400 }
      )
    }

    // Build transaction - if vault provided, set both in one tx
    const txData = vaultAddress
      ? await buildSetStrategyAndVaultTransaction(ensName, strategy.toLowerCase(), vaultAddress)
      : await buildSetStrategyTransaction(ensName, strategy.toLowerCase())

    return NextResponse.json(txData)
  } catch (error) {
    console.error('Set strategy error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to build transaction' },
      { status: 500 }
    )
  }
}
