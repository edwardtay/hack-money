/**
 * Execute ETH → Vault with 0.002 ETH (we have 0.0027)
 */
import { getQuote } from '@lifi/sdk'
import { getAddress, formatUnits, createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const MORPHO_SPARK_VAULT = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A'
const RECIPIENT = '0x3843c8727B6b6C42A57164C51a501200C2E2633A'

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

async function execute() {
  const privateKey = process.env.AGENT_PRIVATE_KEY
  if (!privateKey) {
    console.error('No key')
    return
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const amount = '2000000000000000' // 0.002 ETH

  console.log('=== ETH → VAULT ZAP (0.002 ETH) ===')
  console.log('Sender:', account.address)
  console.log('Recipient:', RECIPIENT)

  const publicClient = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })
  const walletClient = createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') })

  // Check ETH balance
  const ethBalance = await publicClient.getBalance({ address: account.address })
  console.log('ETH balance:', formatUnits(ethBalance, 18))

  // Check vault shares before
  const sharesBefore = await publicClient.readContract({
    address: MORPHO_SPARK_VAULT,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [RECIPIENT],
  })
  console.log('Shares before:', formatUnits(sharesBefore, 18))

  console.log('\nGetting quote...')
  const quote = await getQuote({
    fromAddress: getAddress(account.address),
    fromChain: 8453,
    fromToken: '0x0000000000000000000000000000000000000000',
    fromAmount: amount,
    toChain: 8453,
    toToken: getAddress(MORPHO_SPARK_VAULT),
    toAddress: getAddress(RECIPIENT),
    slippage: 0.01,
  })

  console.log('Route:', quote.includedSteps?.map(s => s.toolDetails?.name || s.type).join(' -> '))
  console.log('Expected:', formatUnits(BigInt(quote.estimate.toAmount), 18), 'shares')

  const tx = quote.transactionRequest
  if (!tx) {
    console.error('No tx')
    return
  }

  console.log('\nExecuting...')
  const hash = await walletClient.sendTransaction({
    to: tx.to as `0x${string}`,
    data: tx.data as `0x${string}`,
    value: BigInt(tx.value || 0),
    gas: BigInt(800000),
  })

  console.log('TX:', hash)
  console.log('https://basescan.org/tx/' + hash)

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('Status:', receipt.status)

  if (receipt.status !== 'success') {
    console.error('TX failed!')
    return
  }

  await new Promise(r => setTimeout(r, 3000))
  const sharesAfter = await publicClient.readContract({
    address: MORPHO_SPARK_VAULT,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [RECIPIENT],
  })

  const diff = sharesAfter - sharesBefore
  console.log('\nShares after:', formatUnits(sharesAfter, 18))
  console.log('Received:', formatUnits(diff, 18))

  if (diff > BigInt(0)) {
    console.log('\n*** VAULT ZAP WORKS! ***')
  }
}

execute().catch(console.error)
