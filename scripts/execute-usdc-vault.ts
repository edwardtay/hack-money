/**
 * Execute USDC → Vault deposit
 */
import { getQuote } from '@lifi/sdk'
import { getAddress, formatUnits, createWalletClient, createPublicClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const MORPHO_SPARK = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A'
const RECIPIENT = '0x3843c8727B6b6C42A57164C51a501200C2E2633A'
const LIFI_DIAMOND = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE'

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)',
  'function allowance(address, address) view returns (uint256)',
])

async function execute() {
  const privateKey = process.env.AGENT_PRIVATE_KEY
  if (!privateKey) {
    console.error('No key')
    return
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const amount = '100000' // 0.1 USDC (minimal test amount)

  console.log('=== USDC → VAULT (0.1 USDC) ===')
  console.log('Sender:', account.address)
  console.log('Recipient:', RECIPIENT)

  const publicClient = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })
  const walletClient = createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') })

  // Check USDC balance
  const usdcBalance = await publicClient.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  })
  console.log('USDC balance:', formatUnits(usdcBalance, 6))

  if (usdcBalance < BigInt(amount)) {
    console.error('Not enough USDC')
    return
  }

  // Check and set approval
  const allowance = await publicClient.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account.address, LIFI_DIAMOND],
  })
  console.log('Allowance:', formatUnits(allowance, 6))

  if (allowance < BigInt(amount)) {
    console.log('\nApproving USDC to LI.FI...')
    const approveTx = await walletClient.writeContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [LIFI_DIAMOND, BigInt('1000000000')], // 1000 USDC
    })
    await publicClient.waitForTransactionReceipt({ hash: approveTx })
    console.log('Approved!')
  }

  // Check vault shares before
  const sharesBefore = await publicClient.readContract({
    address: MORPHO_SPARK,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [RECIPIENT],
  })
  console.log('Shares before:', formatUnits(sharesBefore, 18))

  console.log('\nGetting quote...')
  const quote = await getQuote({
    fromAddress: getAddress(account.address),
    fromChain: 8453,
    fromToken: USDC,
    fromAmount: amount,
    toChain: 8453,
    toToken: getAddress(MORPHO_SPARK),
    toAddress: getAddress(RECIPIENT),
    slippage: 0.01,
  })

  console.log('Route:', quote.includedSteps?.map(s => s.toolDetails?.name || s.type).join(' -> '))

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
    gas: BigInt(500000),
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
    address: MORPHO_SPARK,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [RECIPIENT],
  })

  const diff = sharesAfter - sharesBefore
  console.log('\nShares after:', formatUnits(sharesAfter, 18))
  console.log('Received:', formatUnits(diff, 18))

  if (diff > BigInt(0)) {
    console.log('\n*** USDC → VAULT WORKS! ***')
  }
}

execute().catch(console.error)
