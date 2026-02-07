import { createWalletClient, createPublicClient, http, formatUnits, getAddress, encodeFunctionData, parseUnits } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local from project root
config({ path: resolve(__dirname, '../.env.local') })

const AGENT_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`
if (!AGENT_KEY) {
  console.error('AGENT_PRIVATE_KEY not found in .env.local')
  process.exit(1)
}

const account = privateKeyToAccount(AGENT_KEY)

// Spark USDC Vault on Base
const SPARK_VAULT = getAddress('0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A')
const USDC = getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
const RECIPIENT = getAddress('0x3843c8727B6b6C42A57164C51a501200C2E2633A')

const baseClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org')
})

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http('https://mainnet.base.org')
})

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'approve',
    type: 'function',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const

const ERC4626_ABI = [
  {
    name: 'deposit',
    type: 'function',
    inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }],
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

async function main() {
  console.log('=== Direct Vault Deposit Test ===\n')
  console.log('Agent:', account.address)
  console.log('Vault:', SPARK_VAULT)
  console.log('Recipient:', RECIPIENT)

  // Check agent USDC balance
  const usdcBalance = await baseClient.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  })

  console.log('\nAgent USDC balance:', formatUnits(usdcBalance, 6))

  if (usdcBalance === BigInt(0)) {
    console.log('No USDC in agent wallet. Skipping deposit test.')
    console.log('First run test-simple-swap.ts to get some USDC.')
    return
  }

  // Check recipient vault shares before
  const sharesBefore = await baseClient.readContract({
    address: SPARK_VAULT,
    abi: ERC4626_ABI,
    functionName: 'balanceOf',
    args: [RECIPIENT],
  })
  console.log('Recipient vault shares (before):', formatUnits(sharesBefore, 6))

  // Deposit 1 USDC to the vault
  const depositAmount = parseUnits('1', 6)
  console.log('\nDepositing 1 USDC to Spark vault...')

  // 1. Approve vault to spend USDC
  console.log('1. Approving vault...')
  const approveHash = await walletClient.writeContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [SPARK_VAULT, depositAmount],
  })
  console.log('Approve TX:', approveHash)
  await baseClient.waitForTransactionReceipt({ hash: approveHash })

  // 2. Deposit to vault (for recipient)
  console.log('2. Depositing to vault...')
  try {
    const depositHash = await walletClient.writeContract({
      address: SPARK_VAULT,
      abi: ERC4626_ABI,
      functionName: 'deposit',
      args: [depositAmount, RECIPIENT],
    })
    console.log('Deposit TX:', depositHash)
    const receipt = await baseClient.waitForTransactionReceipt({ hash: depositHash })
    console.log('Status:', receipt.status === 'success' ? '✅ Success' : '❌ Failed')

    // Check shares after
    const sharesAfter = await baseClient.readContract({
      address: SPARK_VAULT,
      abi: ERC4626_ABI,
      functionName: 'balanceOf',
      args: [RECIPIENT],
    })
    console.log('\nRecipient vault shares (after):', formatUnits(sharesAfter, 6))
    console.log('Shares received:', formatUnits(sharesAfter - sharesBefore, 6))
  } catch (e) {
    console.error('Deposit failed:', e)
  }
}

main().catch(console.error)
