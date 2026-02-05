import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, type Address, formatUnits } from 'viem'
import { base } from 'viem/chains'

const SMART_VAULT_HOOK = '0x47b57632bC8D7218773a7f9EF04D2C4B2cBD4040' as Address

// Known token decimals on Base
const TOKEN_DECIMALS: Record<string, number> = {
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 6, // USDC
  '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2': 6, // USDT
  '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb': 18, // DAI
  '0x4200000000000000000000000000000000000006': 18, // WETH
}

const TOKEN_SYMBOLS: Record<string, string> = {
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 'USDC',
  '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2': 'USDT',
  '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb': 'DAI',
  '0x4200000000000000000000000000000000000006': 'WETH',
}

const smartVaultAbi = [
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
    // Get all receipt IDs for the recipient
    const receiptIds = (await client.readContract({
      address: SMART_VAULT_HOOK,
      abi: smartVaultAbi,
      functionName: 'getRecipientReceipts',
      args: [recipient as Address],
    })) as bigint[]

    if (receiptIds.length === 0) {
      return NextResponse.json({ receipts: [] })
    }

    // Fetch details for each receipt (limit to last 20)
    const recentIds = receiptIds.slice(-20)
    const receipts = await Promise.all(
      recentIds.map(async (id) => {
        const [sender, , token, totalAmount, timestamp, deposits] = await client.readContract({
          address: SMART_VAULT_HOOK,
          abi: smartVaultAbi,
          functionName: 'getReceipt',
          args: [id],
        })

        const tokenAddress = token.toLowerCase()
        const decimals = TOKEN_DECIMALS[token] ?? 18
        const symbol = TOKEN_SYMBOLS[token] ?? 'TOKEN'

        return {
          id: id.toString(),
          sender,
          token: tokenAddress,
          tokenSymbol: symbol,
          amount: formatUnits(totalAmount as bigint, decimals),
          timestamp: new Date(Number(timestamp) * 1000).toISOString(),
          deposits: (deposits as { vault: string; amount: bigint; shares: bigint }[]).map((d) => ({
            vault: d.vault,
            amount: formatUnits(d.amount, decimals),
            shares: d.shares.toString(),
          })),
          nftId: id.toString(),
        }
      })
    )

    // Return in reverse chronological order
    return NextResponse.json({ receipts: receipts.reverse() })
  } catch (error) {
    console.error('Error fetching SmartVaultHook receipts:', error)
    return NextResponse.json({ receipts: [] }, { status: 200 })
  }
}
