/**
 * Execute real restaking test:
 * 1. Wrap ETH → WETH
 * 2. Approve WETH to RestakingRouter
 * 3. Call RestakingRouter.depositToRestaking
 * 4. Verify ezETH received
 */
import { createWalletClient, createPublicClient, http, formatEther, parseEther, encodeFunctionData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const RESTAKING_ROUTER = '0x31549dB00B180d528f77083b130C0A045D0CF117'
const WETH_BASE = '0x4200000000000000000000000000000000000006'
const EZETH_BASE = '0x2416092f143378750bb29b79eD961ab195CcEea5'
const RECIPIENT = '0x3843c8727B6b6C42A57164C51a501200C2E2633A' // edwardtay.eth

const WETH_ABI = [
  { name: 'deposit', type: 'function', inputs: [], outputs: [], stateMutability: 'payable' },
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
] as const

const RESTAKING_ABI = [
  {
    name: 'depositToRestaking',
    type: 'function',
    inputs: [{ name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: 'ezETHAmount', type: 'uint256' }],
  },
] as const

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
] as const

async function executeRestakingTest() {
  const privateKey = process.env.AGENT_PRIVATE_KEY
  if (!privateKey) {
    console.error('AGENT_PRIVATE_KEY not set')
    return
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const amount = parseEther('0.0005') // 0.0005 ETH

  console.log('=== RESTAKING TEST ===')
  console.log('Sender:', account.address)
  console.log('Recipient:', RECIPIENT)
  console.log('Amount:', formatEther(amount), 'ETH')

  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  })

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http('https://mainnet.base.org'),
  })

  // Check ezETH balance before
  const ezethBefore = await publicClient.readContract({
    address: EZETH_BASE,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [RECIPIENT],
  })
  console.log('\nRecipient ezETH balance (before):', formatEther(ezethBefore))

  // Step 1: Wrap ETH to WETH
  console.log('\n1. Wrapping ETH → WETH...')
  const wrapHash = await walletClient.sendTransaction({
    to: WETH_BASE,
    value: amount,
    data: encodeFunctionData({ abi: WETH_ABI, functionName: 'deposit' }),
    gas: BigInt(50000),
  })
  console.log('Wrap TX:', wrapHash)
  await publicClient.waitForTransactionReceipt({ hash: wrapHash })
  console.log('✅ Wrapped')

  // Step 2: Approve WETH to RestakingRouter
  console.log('\n2. Approving WETH to RestakingRouter...')
  const approveHash = await walletClient.writeContract({
    address: WETH_BASE,
    abi: WETH_ABI,
    functionName: 'approve',
    args: [RESTAKING_ROUTER, amount],
    gas: BigInt(50000),
  })
  console.log('Approve TX:', approveHash)
  await publicClient.waitForTransactionReceipt({ hash: approveHash })
  console.log('✅ Approved')

  // Step 3: Call RestakingRouter.depositToRestaking
  console.log('\n3. Calling RestakingRouter.depositToRestaking...')
  try {
    const depositHash = await walletClient.writeContract({
      address: RESTAKING_ROUTER,
      abi: RESTAKING_ABI,
      functionName: 'depositToRestaking',
      args: [RECIPIENT, amount],
      gas: BigInt(400000),
    })
    console.log('Deposit TX:', depositHash)
    console.log('BaseScan: https://basescan.org/tx/' + depositHash)

    const receipt = await publicClient.waitForTransactionReceipt({ hash: depositHash })
    console.log('Status:', receipt.status === 'success' ? '✅ Success' : '❌ Failed')

    // Step 4: Check ezETH balance after
    console.log('\n4. Checking ezETH balance...')
    await new Promise(r => setTimeout(r, 2000))
    
    const ezethAfter = await publicClient.readContract({
      address: EZETH_BASE,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [RECIPIENT],
    })
    console.log('Recipient ezETH balance (after):', formatEther(ezethAfter))
    
    const diff = ezethAfter - ezethBefore
    console.log('\n=== RESULT ===')
    console.log('ezETH received:', formatEther(diff))
    
    if (diff > BigInt(0)) {
      console.log('✅ RESTAKING WORKS!')
    } else {
      console.log('❌ No ezETH received')
    }

  } catch (error) {
    console.error('Deposit failed:', error instanceof Error ? error.message : error)
  }
}

executeRestakingTest()
