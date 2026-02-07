/**
 * Test if LI.FI Contract Calls work for restaking
 */
import { getContractCallsQuote, type ContractCallsQuoteRequest } from '@lifi/sdk'
import { getAddress, encodeFunctionData } from 'viem'

const RESTAKING_ROUTER = '0x31549dB00B180d528f77083b130C0A045D0CF117'
const WETH_BASE = '0x4200000000000000000000000000000000000006'

const RESTAKING_ROUTER_ABI = [
  {
    name: 'depositToRestaking',
    type: 'function',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'ezETHAmount', type: 'uint256' }],
  },
] as const

async function testRestakingContractCalls() {
  const fromAddress = getAddress('0x3843c8727B6b6C42A57164C51a501200C2E2633A')
  const recipient = fromAddress
  const amount = '1000000000000000' // 0.001 ETH

  console.log('Testing LI.FI Contract Calls for restaking...')
  console.log('From:', fromAddress)
  console.log('Recipient:', recipient)
  console.log('Amount:', amount)

  // Build calldata
  const callData = encodeFunctionData({
    abi: RESTAKING_ROUTER_ABI,
    functionName: 'depositToRestaking',
    args: [recipient, BigInt(amount)],
  })

  console.log('\nCalldata:', callData.slice(0, 50) + '...')

  try {
    const request: ContractCallsQuoteRequest = {
      fromAddress,
      fromChain: 8453, // Base
      fromToken: '0x0000000000000000000000000000000000000000', // ETH
      toChain: 8453,
      toToken: WETH_BASE,
      toAmount: amount,
      toFallbackAddress: recipient,
      contractCalls: [
        {
          fromAmount: amount,
          fromTokenAddress: WETH_BASE,
          toContractAddress: RESTAKING_ROUTER,
          toContractCallData: callData,
          toContractGasLimit: '350000',
        },
      ],
      slippage: 0.01,
    }

    const quote = await getContractCallsQuote(request)

    console.log('\n✅ Contract Calls quote successful!')
    console.log('Included steps:', quote.includedSteps?.length || 0)
    console.log('Estimate toAmount:', quote.estimate?.toAmount)
    
    // Check the transaction
    const tx = quote.transactionRequest
    if (tx) {
      console.log('\nTransaction:')
      console.log('To:', tx.to)
      console.log('Value:', tx.value)
      console.log('Data length:', tx.data?.length)
    }

  } catch (error) {
    console.error('\n❌ Contract Calls failed:', error instanceof Error ? error.message : error)
  }
}

testRestakingContractCalls()
