import { NextRequest, NextResponse } from 'next/server'
import { encodeFunctionData, type Address } from 'viem'

const SMART_VAULT_HOOK = '0x47b57632bC8D7218773a7f9EF04D2C4B2cBD4040' as Address

const smartVaultAbi = [
  {
    name: 'setVaultAllocation',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'vaults', type: 'address[]' },
      { name: 'allocations', type: 'uint16[]' },
    ],
    outputs: [],
  },
  {
    name: 'enableConditionalRouting',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'vaults', type: 'address[]' }],
    outputs: [],
  },
  {
    name: 'disableConditionalRouting',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, vaults, allocations } = body

    if (action === 'setAllocation') {
      // Validate inputs
      if (!vaults || !Array.isArray(vaults) || vaults.length === 0) {
        return NextResponse.json({ error: 'Invalid vaults array' }, { status: 400 })
      }
      if (!allocations || !Array.isArray(allocations) || allocations.length !== vaults.length) {
        return NextResponse.json({ error: 'Invalid allocations array' }, { status: 400 })
      }

      // Convert percentages to basis points
      const bpsAllocations = allocations.map((pct: number) => Math.round(pct * 100))

      // Validate total is 10000 bps (100%)
      const total = bpsAllocations.reduce((sum: number, bps: number) => sum + bps, 0)
      if (total !== 10000) {
        return NextResponse.json(
          { error: `Allocations must sum to 100% (got ${total / 100}%)` },
          { status: 400 }
        )
      }

      const data = encodeFunctionData({
        abi: smartVaultAbi,
        functionName: 'setVaultAllocation',
        args: [vaults as Address[], bpsAllocations as number[]],
      })

      return NextResponse.json({
        to: SMART_VAULT_HOOK,
        data,
        value: '0',
        chainId: 8453, // Base
      })
    }

    if (action === 'enableConditional') {
      if (!vaults || !Array.isArray(vaults) || vaults.length === 0) {
        return NextResponse.json({ error: 'Invalid vaults array' }, { status: 400 })
      }

      const data = encodeFunctionData({
        abi: smartVaultAbi,
        functionName: 'enableConditionalRouting',
        args: [vaults as Address[]],
      })

      return NextResponse.json({
        to: SMART_VAULT_HOOK,
        data,
        value: '0',
        chainId: 8453,
      })
    }

    if (action === 'disableConditional') {
      const data = encodeFunctionData({
        abi: smartVaultAbi,
        functionName: 'disableConditionalRouting',
        args: [],
      })

      return NextResponse.json({
        to: SMART_VAULT_HOOK,
        data,
        value: '0',
        chainId: 8453,
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error building SmartVaultHook tx:', error)
    return NextResponse.json({ error: 'Failed to build transaction' }, { status: 500 })
  }
}
