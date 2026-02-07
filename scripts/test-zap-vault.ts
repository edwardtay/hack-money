/**
 * Test LI.FI Zaps approach - use vault address as toToken
 * This swaps directly into vault shares via DEX routing
 */
import { getQuote } from '@lifi/sdk'
import { getAddress, formatUnits } from 'viem'

// ERC-4626 Vaults on Base
const VAULTS = {
  'Morpho Spark USDC': '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
  'Aave USDC': '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',
  'Moonwell USDC': '0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca',
}

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

async function testZapToVault(vaultName: string, vaultAddress: string) {
  console.log('\n=== Testing: ' + vaultName + ' ===')
  console.log('Vault: ' + vaultAddress)
  
  const fromAddress = getAddress('0x3843c8727B6b6C42A57164C51a501200C2E2633A')
  const amount = '1000000' // 1 USDC
  
  try {
    console.log('\nTrying USDC -> Vault shares...')
    const quote = await getQuote({
      fromAddress,
      fromChain: 8453,
      fromToken: USDC_BASE,
      fromAmount: amount,
      toChain: 8453,
      toToken: getAddress(vaultAddress),
      toAddress: fromAddress,
      slippage: 0.01,
    })
    
    console.log('SUCCESS!')
    console.log('Route:', quote.includedSteps?.map(s => s.toolDetails?.name || s.type).join(' -> '))
    console.log('From:', quote.action.fromToken.symbol, formatUnits(BigInt(quote.action.fromAmount), quote.action.fromToken.decimals))
    console.log('To:', quote.action.toToken.symbol, formatUnits(BigInt(quote.estimate.toAmount), quote.action.toToken.decimals))
    console.log('Gas USD:', quote.estimate.gasCosts?.[0]?.amountUSD || 'N/A')
    
    return true
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.log('FAILED:', msg.slice(0, 200))
    return false
  }
}

async function main() {
  console.log('Testing LI.FI Zaps: USDC -> Vault shares')
  console.log('Base chain, 1 USDC test amount\n')
  
  for (const [name, address] of Object.entries(VAULTS)) {
    await testZapToVault(name, address)
  }
}

main()
