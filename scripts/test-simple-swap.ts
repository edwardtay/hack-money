/**
 * Test simple swap: ETH -> USDC (no vault)
 */
import { getQuote } from '@lifi/sdk'
import { getAddress, formatUnits, createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const RECIPIENT = '0x3843c8727B6b6C42A57164C51a501200C2E2633A'

async function execute() {
  const privateKey = process.env.AGENT_PRIVATE_KEY
  if (!privateKey) { console.error('No key'); return }

  const account = privateKeyToAccount(privateKey as `0x${string}`)

  console.log('=== SIMPLE ETH -> USDC ===')
  
  const publicClient = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })
  const walletClient = createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') })

  const quote = await getQuote({
    fromAddress: getAddress(account.address),
    fromChain: 8453,
    fromToken: '0x0000000000000000000000000000000000000000',
    fromAmount: '500000000000000',
    toChain: 8453,
    toToken: USDC,
    toAddress: getAddress(RECIPIENT),
    slippage: 0.01,
    denyExchanges: ['nordstern'],
  })

  console.log('Route:', quote.includedSteps?.map(s => s.toolDetails?.name || s.type).join(' -> '))
  console.log('Expected USDC:', formatUnits(BigInt(quote.estimate.toAmount), 6))

  const tx = quote.transactionRequest
  if (!tx) { console.error('No tx'); return }

  const hash = await walletClient.sendTransaction({
    to: tx.to as `0x${string}`,
    data: tx.data as `0x${string}`,
    value: BigInt(tx.value || 0),
    gas: BigInt(500000),
  })

  console.log('TX:', hash)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('Status:', receipt.status)
  
  if (receipt.status === 'success') {
    console.log('\n*** SIMPLE SWAP WORKS ***')
  }
}

execute().catch(console.error)
