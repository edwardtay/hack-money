/**
 * Direct vault deposit (no LI.FI) to verify vault works
 */
import { createWalletClient, createPublicClient, http, parseAbi, formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const MORPHO_SPARK = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A'
const RECIPIENT = '0x3843c8727B6b6C42A57164C51a501200C2E2633A'

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)',
  'function allowance(address, address) view returns (uint256)',
])

const VAULT_ABI = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
  'function balanceOf(address) view returns (uint256)',
])

async function execute() {
  const privateKey = process.env.AGENT_PRIVATE_KEY
  if (!privateKey) {
    console.error('No key')
    return
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const amount = BigInt('100000') // 0.1 USDC

  console.log('=== DIRECT VAULT DEPOSIT ===')
  console.log('Sender:', account.address)
  console.log('Recipient:', RECIPIENT)
  console.log('Amount: 0.1 USDC')

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

  // Check and set approval TO VAULT (not LI.FI)
  const allowance = await publicClient.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account.address, MORPHO_SPARK],
  })
  console.log('Allowance to vault:', formatUnits(allowance, 6))

  if (allowance < amount) {
    console.log('\nApproving USDC to vault...')
    const approveTx = await walletClient.writeContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [MORPHO_SPARK, BigInt('1000000000')], // 1000 USDC
    })
    await publicClient.waitForTransactionReceipt({ hash: approveTx })
    console.log('Approved!')
  }

  // Check shares before
  const sharesBefore = await publicClient.readContract({
    address: MORPHO_SPARK,
    abi: VAULT_ABI,
    functionName: 'balanceOf',
    args: [RECIPIENT],
  })
  console.log('Shares before:', formatUnits(sharesBefore, 18))

  // Direct deposit
  console.log('\nDepositing directly to vault...')
  const hash = await walletClient.writeContract({
    address: MORPHO_SPARK,
    abi: VAULT_ABI,
    functionName: 'deposit',
    args: [amount, RECIPIENT],
  })

  console.log('TX:', hash)
  console.log('https://basescan.org/tx/' + hash)

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('Status:', receipt.status)

  if (receipt.status !== 'success') {
    console.error('TX failed!')
    return
  }

  // Check shares after
  await new Promise(r => setTimeout(r, 2000))
  const sharesAfter = await publicClient.readContract({
    address: MORPHO_SPARK,
    abi: VAULT_ABI,
    functionName: 'balanceOf',
    args: [RECIPIENT],
  })

  const diff = sharesAfter - sharesBefore
  console.log('\nShares after:', formatUnits(sharesAfter, 18))
  console.log('Received:', formatUnits(diff, 18))

  if (diff > BigInt(0)) {
    console.log('\n*** DIRECT VAULT DEPOSIT WORKS! ***')
    console.log('The vault is fine - LI.FI Composer is the problem')
  }
}

execute().catch(console.error)
