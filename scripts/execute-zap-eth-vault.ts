/**
 * Execute: ETH -> Morpho Spark vault shares
 */
import { getQuote } from '@lifi/sdk'
import { getAddress, formatUnits, createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const MORPHO_SPARK_VAULT = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A'
const ETH = '0x0000000000000000000000000000000000000000'
const RECIPIENT = '0x3843c8727B6b6C42A57164C51a501200C2E2633A'

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
] as const

async function execute() {
  const privateKey = process.env.AGENT_PRIVATE_KEY
  if (!privateKey) {
    console.error('AGENT_PRIVATE_KEY not set')
    return
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const amount = '500000000000000' // 0.0005 ETH

  console.log('=== ETH -> VAULT ZAP ===')
  console.log('Sender:', account.address)
  console.log('Recipient:', RECIPIENT)
  console.log('Amount: 0.0005 ETH')

  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  })

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http('https://mainnet.base.org'),
  })

  // Check vault shares before
  const sharesBefore = await publicClient.readContract({
    address: MORPHO_SPARK_VAULT,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [RECIPIENT],
  })
  console.log('\nRecipient vault shares (before):', formatUnits(sharesBefore, 18))

  // Get quote
  console.log('\n1. Getting quote...')
  const quote = await getQuote({
    fromAddress: getAddress(account.address),
    fromChain: 8453,
    fromToken: ETH,
    fromAmount: amount,
    toChain: 8453,
    toToken: getAddress(MORPHO_SPARK_VAULT),
    toAddress: getAddress(RECIPIENT),
    slippage: 0.01,
  })

  console.log('Route:', quote.includedSteps?.map(s => s.toolDetails?.name || s.type).join(' -> '))
  console.log('Expected:', formatUnits(BigInt(quote.estimate.toAmount), 18), 'vault shares')

  const tx = quote.transactionRequest
  if (!tx) {
    console.error('No transaction')
    return
  }

  // Execute (no approval needed for ETH)
  console.log('\n2. Executing...')
  const hash = await walletClient.sendTransaction({
    to: tx.to as `0x${string}`,
    data: tx.data as `0x${string}`,
    value: BigInt(tx.value || 0),
    gas: BigInt(600000),
  })

  console.log('TX:', hash)
  console.log('BaseScan: https://basescan.org/tx/' + hash)

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('Status:', receipt.status === 'success' ? 'SUCCESS' : 'FAILED')

  if (receipt.status !== 'success') {
    console.error('Failed')
    return
  }

  // Check shares after
  await new Promise(r => setTimeout(r, 3000))
  const sharesAfter = await publicClient.readContract({
    address: MORPHO_SPARK_VAULT,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [RECIPIENT],
  })
  
  const diff = sharesAfter - sharesBefore
  console.log('\nRecipient vault shares (after):', formatUnits(sharesAfter, 18))
  console.log('Shares received:', formatUnits(diff, 18))
  
  if (diff > BigInt(0)) {
    console.log('\n=== VAULT ZAP WORKS! ===')
    console.log('edwardtay.eth received', formatUnits(diff, 18), 'sparkUSDC vault shares')
  }
}

execute().catch(console.error)
