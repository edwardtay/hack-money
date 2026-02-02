export type MessageRole = 'user' | 'agent'

export type RouteType = 'standard' | 'composer' | 'contract-call'

export type RouteOption = {
  id: string
  path: string         // e.g. "Base USDC -> Arbitrum USDC"
  fee: string          // e.g. "$0.12"
  estimatedTime: string
  provider: string     // e.g. "LI.FI", "Circle CCTP", "Uniswap v4"
  routeType?: RouteType // categorise route for frontend display
}

export type ParsedIntent = {
  action: 'transfer' | 'swap' | 'deposit' | 'yield' | 'pay_x402'
  amount: string
  fromToken: string
  toToken: string
  toAddress?: string
  toChain?: string
  fromChain?: string
  url?: string         // for x402
  vaultProtocol?: string // e.g. "aave", "morpho" — used for Composer routes
}

export type Message = {
  id: string
  role: MessageRole
  content: string
  intent?: ParsedIntent
  routes?: RouteOption[]
  txHash?: string
  timestamp: number
}
