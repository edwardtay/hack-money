import { http, createStorage, cookieStorage } from 'wagmi'
import { mainnet, arbitrum, base, optimism } from 'wagmi/chains'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'

export const config = getDefaultConfig({
  appName: 'PayAgent',
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'demo',
  chains: [mainnet, arbitrum, base, optimism],
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
  },
})
