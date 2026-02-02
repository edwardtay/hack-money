import { createPublicClient, http } from 'viem'
import { normalize } from 'viem/ens'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ETH_RPC_URL || 'https://eth.llamarpc.com'),
})

export async function resolveENS(name: string): Promise<{
  address: string | null
  preferredChain?: string
  preferredToken?: string
}> {
  const address = await client.getEnsAddress({ name: normalize(name) })

  let preferredChain: string | undefined
  let preferredToken: string | undefined
  try {
    const chainRecord = await client.getEnsText({
      name: normalize(name),
      key: 'com.payagent.chain',
    })
    const tokenRecord = await client.getEnsText({
      name: normalize(name),
      key: 'com.payagent.token',
    })
    preferredChain = chainRecord || undefined
    preferredToken = tokenRecord || undefined
  } catch {
    // Text records not set, that's fine
  }

  return { address, preferredChain, preferredToken }
}
