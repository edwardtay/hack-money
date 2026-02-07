import { createWalletClient, createPublicClient, http, parseEther, formatEther, formatUnits, getAddress } from 'viem'
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

// Moonwell USDC vault on Base (ERC-4626 - verified to work with third-party deposits)
const MOONWELL_VAULT = getAddress('0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca')

// edwardtay.eth address from demo cache
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

// ERC-4626 vault ABI (just balanceOf)
const VAULT_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

async function main() {
  console.log('=== ENSIO Yield Route Test ===\n')
  console.log('Agent wallet:', account.address)
  console.log('Recipient (edwardtay.eth):', RECIPIENT)
  console.log('Aave USDC Vault:', MOONWELL_VAULT)

  // Check initial balances
  const initialEth = await baseClient.getBalance({ address: account.address })
  console.log('\nAgent ETH balance:', formatEther(initialEth))

  // Check recipient's vault shares BEFORE
  const vaultSharesBefore = await baseClient.readContract({
    address: MOONWELL_VAULT,
    abi: VAULT_ABI,
    functionName: 'balanceOf',
    args: [RECIPIENT],
  })
  console.log('Recipient vault shares (before):', formatUnits(vaultSharesBefore, 18))

  // Amount to send: 0.002 ETH (~$5)
  const amountEth = '0.002'
  console.log('\nSending:', amountEth, 'ETH')

  // Step 1: Get quote
  console.log('\n1. Getting quote from /api/quote...')

  const quoteRes = await fetch('http://localhost:3000/api/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromChain: 'base',
      fromToken: 'ETH',
      amount: amountEth,
      userAddress: account.address,
      toAddress: 'edwardtay.eth',
      slippage: 0.01,
    }),
  })

  if (!quoteRes.ok) {
    const error = await quoteRes.text()
    console.error('Quote failed:', error)
    process.exit(1)
  }

  const quote = await quoteRes.json()
  console.log('Quote received!')
  console.log('  - Using yield route:', quote.useYieldRoute)
  console.log('  - Routes:', quote.routes.length)
  console.log('  - First route:', quote.routes[0]?.path)

  if (!quote.useYieldRoute) {
    console.error('Yield route not enabled!')
    console.log('yieldRouteError:', quote.yieldRouteError)
    process.exit(1)
  }

  // Step 2: Get transaction via execute API
  console.log('\n2. Getting transaction from /api/execute...')

  const executeRes = await fetch('http://localhost:3000/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      routeId: 'yield-route-0',
      fromAddress: account.address,
      intent: {
        type: 'pay',
        fromToken: 'ETH',
        fromChain: 'base',
        toChain: 'base',
        amount: amountEth,
        toAddress: RECIPIENT,
      },
      yieldVault: MOONWELL_VAULT,
      recipient: RECIPIENT,
      slippage: 0.01,
    }),
  })

  if (!executeRes.ok) {
    const error = await executeRes.text()
    console.error('Execute failed:', error)
    process.exit(1)
  }

  const tx = await executeRes.json()
  console.log('Transaction built!')
  console.log('  - To:', tx.to)
  console.log('  - Value:', formatEther(BigInt(tx.value || 0)), 'ETH')
  console.log('  - Provider:', tx.provider)

  // Step 3: Execute the transaction
  console.log('\n3. Sending transaction...')

  const hash = await walletClient.sendTransaction({
    to: tx.to as `0x${string}`,
    value: BigInt(tx.value || 0),
    data: tx.data as `0x${string}`,
    gas: BigInt(500000),
  })

  console.log('Transaction sent:', hash)
  console.log('Waiting for confirmation...')

  const receipt = await baseClient.waitForTransactionReceipt({ hash })
  console.log('Transaction confirmed in block:', receipt.blockNumber)
  console.log('Status:', receipt.status === 'success' ? '✅ Success' : '❌ Failed')
  console.log('Gas used:', receipt.gasUsed.toString())
  console.log('BaseScan: https://basescan.org/tx/' + hash)

  // Step 4: Check recipient's vault shares AFTER
  console.log('\n4. Checking vault shares...')

  // Wait for state to settle
  await new Promise(r => setTimeout(r, 3000))

  const vaultSharesAfter = await baseClient.readContract({
    address: MOONWELL_VAULT,
    abi: VAULT_ABI,
    functionName: 'balanceOf',
    args: [RECIPIENT],
  })

  const sharesDiff = vaultSharesAfter - vaultSharesBefore

  console.log('Recipient vault shares (after):', formatUnits(vaultSharesAfter, 18))
  console.log('Shares received:', formatUnits(sharesDiff, 18))

  if (sharesDiff > BigInt(0)) {
    console.log('\n✅ YIELD ROUTE WORKS!')
    console.log(`   ${amountEth} ETH → ${formatUnits(sharesDiff, 18)} aUSDC (vault shares)`)
    console.log('   These shares will earn ~5% APY over time')
  } else {
    console.log('\n⚠️  No vault shares received - check transaction details')
  }
}

main().catch(console.error)
