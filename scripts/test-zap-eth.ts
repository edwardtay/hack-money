/**
 * Test LI.FI Zaps: ETH -> Vault shares (no approval needed)
 */
import { getQuote } from '@lifi/sdk'
import { getAddress, formatUnits } from 'viem'

const MORPHO_SPARK_VAULT = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A'
const ETH = '0x0000000000000000000000000000000000000000'

async function testEthToVault() {
  console.log('Testing ETH -> Morpho Spark vault shares')
  
  const fromAddress = getAddress('0x3843c8727B6b6C42A57164C51a501200C2E2633A')
  const amount = '500000000000000' // 0.0005 ETH
  
  try {
    const quote = await getQuote({
      fromAddress,
      fromChain: 8453,
      fromToken: ETH,
      fromAmount: amount,
      toChain: 8453,
      toToken: getAddress(MORPHO_SPARK_VAULT),
      toAddress: fromAddress,
      slippage: 0.01,
    })
    
    console.log('\nSUCCESS!')
    console.log('Route:', quote.includedSteps?.map(s => s.toolDetails?.name || s.type).join(' -> '))
    console.log('From: ETH', formatUnits(BigInt(quote.action.fromAmount), 18))
    console.log('To:', quote.action.toToken.symbol, formatUnits(BigInt(quote.estimate.toAmount), 18))
    console.log('Gas USD:', quote.estimate.gasCosts?.[0]?.amountUSD || 'N/A')
    console.log('\nTransaction to:', quote.transactionRequest?.to)
    console.log('Value:', quote.transactionRequest?.value)
    
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.log('FAILED:', msg.slice(0, 300))
  }
}

testEthToVault()
