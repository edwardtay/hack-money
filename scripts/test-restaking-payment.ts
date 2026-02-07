/**
 * Test restaking payment flow:
 * 1. Get quote for ETH → RestakingRouter (which deposits to Renzo → ezETH to recipient)
 * 2. Execute the transaction
 */
import { getQuote } from '@lifi/sdk'
import { getAddress, createWalletClient, createPublicClient, http, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const RESTAKING_ROUTER = '0x31549dB00B180d528f77083b130C0A045D0CF117'
const WETH_BASE = '0x4200000000000000000000000000000000000006'
const EZETH_BASE = '0x2416092f143378750bb29b79eD961ab195CcEea5'

// Renzo xRenzoDeposit on Base
const RENZO_DEPOSIT = '0xf25484650484DE3d554fB0b7125e7696efA4ab99'

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

async function testRestakingPayment() {
  const privateKey = process.env.AGENT_PRIVATE_KEY
  if (!privateKey) {
    console.error('AGENT_PRIVATE_KEY not set in .env.local')
    return
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const recipient = getAddress('0x3843c8727B6b6C42A57164C51a501200C2E2633A') // edwardtay.eth
  
  console.log('Testing restaking payment...')
  console.log('Sender:', account.address)
  console.log('Recipient:', recipient)
  console.log('RestakingRouter:', RESTAKING_ROUTER)

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
    args: [recipient],
  })
  console.log('\nRecipient ezETH balance (before):', formatEther(ezethBefore))

  // Get quote: ETH → WETH → RestakingRouter
  console.log('\n1. Getting quote...')
  const amount = '500000000000000' // 0.0005 ETH
  
  try {
    const quote = await getQuote({
      fromAddress: getAddress(account.address),
      fromChain: 8453,
      fromToken: '0x0000000000000000000000000000000000000000', // ETH
      fromAmount: amount,
      toChain: 8453,
      toToken: WETH_BASE,
      toAddress: getAddress(RESTAKING_ROUTER),
      slippage: 0.01,
    })

    console.log('Quote received!')
    console.log('Route:', quote.action.fromToken.symbol, '→', quote.action.toToken.symbol)
    console.log('Estimated output:', formatEther(BigInt(quote.estimate.toAmount)))

    // Execute the LI.FI transaction (sends WETH to RestakingRouter)
    console.log('\n2. Executing LI.FI swap...')
    const tx = quote.transactionRequest
    if (!tx) {
      console.error('No transaction request in quote')
      return
    }

    const hash = await walletClient.sendTransaction({
      to: tx.to as `0x${string}`,
      value: BigInt(tx.value || 0),
      data: tx.data as `0x${string}`,
      gas: BigInt(300000),
    })

    console.log('TX sent:', hash)
    console.log('Waiting for confirmation...')

    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    console.log('Status:', receipt.status === 'success' ? '✅ Success' : '❌ Failed')
    console.log('BaseScan: https://basescan.org/tx/' + hash)

    if (receipt.status !== 'success') {
      console.error('Transaction failed')
      return
    }

    // Now we need to call RestakingRouter.depositToRestaking
    // But wait - the restaking router already has the WETH now
    // Let's check WETH balance of router
    const routerWeth = await publicClient.readContract({
      address: WETH_BASE,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [RESTAKING_ROUTER],
    })
    console.log('\nRestakingRouter WETH balance:', formatEther(routerWeth))

    // The RestakingRouter should be called by someone to actually deposit to Renzo
    // For now, let's just check if the flow worked up to this point
    console.log('\n✅ WETH successfully sent to RestakingRouter!')
    console.log('Next step: Call RestakingRouter.depositToRestaking() to complete the deposit')

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error)
  }
}

testRestakingPayment()
