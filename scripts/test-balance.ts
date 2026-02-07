import { createPublicClient, http, formatEther } from 'viem'
import { base, arbitrum } from 'viem/chains'
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

console.log('Agent wallet:', account.address)

const baseClient = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })
const arbClient = createPublicClient({ chain: arbitrum, transport: http('https://arb1.arbitrum.io/rpc') })

async function main() {
  const [baseBalance, arbBalance] = await Promise.all([
    baseClient.getBalance({ address: account.address }),
    arbClient.getBalance({ address: account.address }),
  ])

  console.log('Base ETH:', formatEther(baseBalance))
  console.log('Arbitrum ETH:', formatEther(arbBalance))
}

main().catch(console.error)
