/**
 * com.pay.config - Single JSON record for all payment preferences
 */

export interface PayConfig {
  version: '1.0'
  receive: {
    token: string // USDC, USDT, ETH
    chain: number // 8453 = Base, 42161 = Arbitrum, 1 = Mainnet
    vault?: string // ERC-4626 vault for yield (optional)
  }
  fallback?: {
    tokens?: string[] // Ordered preference
    chains?: number[] // Ordered preference
  }
  limits?: {
    min?: number // Reject below this USD
    max?: number // Manual approval above this
  }
}

// Chain ID to name mapping
export const CHAINS: Record<number, string> = {
  1: 'Ethereum',
  8453: 'Base',
  42161: 'Arbitrum',
  10: 'Optimism',
  137: 'Polygon',
}

// Default vaults by chain
export const DEFAULT_VAULTS: Record<number, { address: string; name: string; apy: string }> = {
  8453: {
    address: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
    name: 'Morpho Spark USDC',
    apy: '~5%',
  },
}

// Create default config
export function createDefaultConfig(): PayConfig {
  return {
    version: '1.0',
    receive: {
      token: 'USDC',
      chain: 8453, // Base
    },
  }
}

// Parse config from ENS text record
export function parsePayConfig(json: string | undefined): PayConfig | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    if (parsed.version === '1.0' && parsed.receive) {
      return parsed as PayConfig
    }
    return null
  } catch {
    return null
  }
}

// Serialize config for ENS text record
export function serializePayConfig(config: PayConfig): string {
  return JSON.stringify(config)
}

// Get human-readable summary
export function getConfigSummary(config: PayConfig): string {
  const chain = CHAINS[config.receive.chain] || `Chain ${config.receive.chain}`
  const base = `${config.receive.token} on ${chain}`

  if (config.receive.vault) {
    const vault = DEFAULT_VAULTS[config.receive.chain]
    return `${base} → ${vault?.name || 'Yield Vault'} (${vault?.apy || 'earning yield'})`
  }

  return base
}
