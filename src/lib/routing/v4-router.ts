import { keccak256, encodeAbiParameters, type Address } from 'viem'
import type { RouteOption } from '@/lib/types'
import { STABLECOINS } from './tokens'

// Stablecoin addresses per chain (checksummed)
const TOKEN_ADDRESSES: Record<string, Record<string, Address>> = {
  ethereum: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  },
  base: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  },
  arbitrum: {
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  },
  optimism: {
    USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  },
}

// Deployed PayAgentHook addresses per chain
const HOOK_ADDRESSES: Record<string, Address> = {
  ethereum: '0x0000000000000000000000000000000000000000',
  base: '0x0000000000000000000000000000000000000000',
  arbitrum: '0x0000000000000000000000000000000000000000',
  optimism: '0x0000000000000000000000000000000000000000',
}

// Default pool parameters for stablecoin pairs
const STABLE_POOL_FEE = 100 // 0.01% fee tier for stablecoins
const STABLE_TICK_SPACING = 1

// Minimum pool liquidity (in token units) required to recommend the v4 route
const MIN_POOL_LIQUIDITY = BigInt(1000) // $1,000 minimum

/**
 * Compute a Uniswap v4 PoolId from PoolKey components.
 * Mirrors PoolIdLibrary.toId(): keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
 */
export function computePoolId(params: {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address', name: 'currency0' },
        { type: 'address', name: 'currency1' },
        { type: 'uint24', name: 'fee' },
        { type: 'int24', name: 'tickSpacing' },
        { type: 'address', name: 'hooks' },
      ],
      [
        params.currency0,
        params.currency1,
        params.fee,
        params.tickSpacing,
        params.hooks,
      ]
    )
  )
}

/**
 * Sort two token addresses into canonical order (lower address first),
 * matching Uniswap v4's currency0 < currency1 requirement.
 */
function sortTokens(a: Address, b: Address): [Address, Address] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a]
}

export function findV4Routes(params: {
  fromChain: string
  toChain: string
  fromToken: string
  toToken: string
  amount: string
  poolLiquidity?: bigint
}): RouteOption[] {
  // Only offer v4 route for same-chain stablecoin-to-stablecoin swaps
  const isSameChain = params.fromChain === params.toChain || !params.toChain
  const isStablePair =
    STABLECOINS.includes(params.fromToken?.toUpperCase()) &&
    STABLECOINS.includes(params.toToken?.toUpperCase())
  const isDifferentToken =
    params.fromToken?.toUpperCase() !== params.toToken?.toUpperCase()

  if (!isSameChain || !isStablePair || !isDifferentToken) {
    return []
  }

  const chain = params.fromChain || 'ethereum'
  const chainTokens = TOKEN_ADDRESSES[chain]
  const hookAddress = HOOK_ADDRESSES[chain]

  if (!chainTokens || !hookAddress) {
    return []
  }

  const fromAddr = chainTokens[params.fromToken.toUpperCase()]
  const toAddr = chainTokens[params.toToken.toUpperCase()]

  if (!fromAddr || !toAddr) {
    return []
  }

  // Validate pool liquidity meets minimum threshold
  if (
    params.poolLiquidity !== undefined &&
    params.poolLiquidity < MIN_POOL_LIQUIDITY
  ) {
    return []
  }

  // Compute the pool ID dynamically from the PoolKey
  const [currency0, currency1] = sortTokens(fromAddr, toAddr)
  const poolId = computePoolId({
    currency0,
    currency1,
    fee: STABLE_POOL_FEE,
    tickSpacing: STABLE_TICK_SPACING,
    hooks: hookAddress,
  })

  return [
    {
      id: `v4-${poolId.slice(0, 18)}`,
      path: `${params.fromToken} → ${params.toToken} via PayAgentHook`,
      fee: '$0.05',
      estimatedTime: '~15s',
      provider: 'Uniswap v4 Hook',
    },
  ]
}
