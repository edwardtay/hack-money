import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, type Address } from 'viem'
import { base } from 'viem/chains'

const SMART_VAULT_HOOK = '0x47b57632bC8D7218773a7f9EF04D2C4B2cBD4040' as Address

const smartVaultAbi = [
  {
    name: 'getVaultAllocation',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'recipient', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'vault', type: 'address' },
          { name: 'bps', type: 'uint16' },
        ],
      },
    ],
  },
  {
    name: 'isConditionalRoutingEnabled',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'recipient', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'getConditionalVaults',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'recipient', type: 'address' }],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    name: 'getRecipientReceipts',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'recipient', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    name: 'getReceipt',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'receiptId', type: 'uint256' }],
    outputs: [
      { name: 'sender', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'totalAmount', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
      {
        name: 'deposits',
        type: 'tuple[]',
        components: [
          { name: 'vault', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'shares', type: 'uint256' },
        ],
      },
    ],
  },
] as const

const client = createPublicClient({
  chain: base,
  transport: http(),
})

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const recipient = searchParams.get('recipient')

  if (!recipient) {
    return NextResponse.json({ error: 'Missing recipient parameter' }, { status: 400 })
  }

  try {
    // Fetch allocation config
    const allocation = await client.readContract({
      address: SMART_VAULT_HOOK,
      abi: smartVaultAbi,
      functionName: 'getVaultAllocation',
      args: [recipient as Address],
    })

    // Fetch conditional routing status
    const conditionalEnabled = await client.readContract({
      address: SMART_VAULT_HOOK,
      abi: smartVaultAbi,
      functionName: 'isConditionalRoutingEnabled',
      args: [recipient as Address],
    })

    // Fetch conditional vaults if enabled
    let conditionalVaults: string[] = []
    if (conditionalEnabled) {
      const vaults = await client.readContract({
        address: SMART_VAULT_HOOK,
        abi: smartVaultAbi,
        functionName: 'getConditionalVaults',
        args: [recipient as Address],
      })
      conditionalVaults = vaults as string[]
    }

    // Convert allocation to a more readable format
    const allocations = (allocation as { vault: string; bps: number }[]).map((a) => ({
      vault: a.vault,
      percentage: Number(a.bps) / 100, // Convert bps to percentage
    }))

    return NextResponse.json({
      allocations,
      conditionalRoutingEnabled: conditionalEnabled,
      conditionalVaults,
      hookAddress: SMART_VAULT_HOOK,
    })
  } catch (error) {
    console.error('Error fetching SmartVaultHook config:', error)
    return NextResponse.json(
      { error: 'Failed to fetch config', allocations: [], conditionalRoutingEnabled: false },
      { status: 200 }
    )
  }
}
