import type { RouteOption } from '@/lib/types'
import { getCached, setCache } from '@/lib/routing/route-cache'

// ---------------------------------------------------------------------------
// Circle Bridge Kit – CCTP V2 cross-chain USDC routes
// ---------------------------------------------------------------------------

/**
 * Chain identifiers used by the Circle Bridge Kit SDK.
 * These map human-readable names to the Bridge Kit enum values.
 */
export const CIRCLE_CHAIN_IDS: Record<string, number> = {
  ethereum: 0,
  arbitrum: 3,
  base: 6,
  optimism: 2,
}

/** Reverse lookup: Bridge Kit chain id -> human name */
const CHAIN_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(CIRCLE_CHAIN_IDS).map(([name, id]) => [id, name])
)

/** USDC contract addresses on supported chains (native USDC, not bridged) */
export const USDC_ADDRESSES: Record<string, string> = {
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
}

/** Supported chain names for quick validation */
export const SUPPORTED_BRIDGE_CHAINS = Object.keys(CIRCLE_CHAIN_IDS)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BridgeRouteParams = {
  fromChain: string
  toChain: string
  amount: string           // human-readable, e.g. "100"
  fromToken?: string       // default: USDC
  toToken?: string         // default: USDC
  fromAddress?: string     // sender wallet (optional for quote)
}

type CCTPQuoteResponse = {
  routes: Array<{
    srcChain: number
    dstChain: number
    amount: string
    fee: string
    estimatedTime: number   // seconds
  }>
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Query Circle Bridge Kit (CCTP V2) for USDC cross-chain transfer routes.
 *
 * Only USDC-to-USDC cross-chain routes are supported. Same-chain or
 * non-USDC requests return an empty array so the caller can fall through
 * to other providers.
 */
export async function findBridgeRoutes(
  params: BridgeRouteParams
): Promise<RouteOption[]> {
  const fromToken = (params.fromToken ?? 'USDC').toUpperCase()
  const toToken = (params.toToken ?? 'USDC').toUpperCase()

  // CCTP only handles USDC <-> USDC
  if (fromToken !== 'USDC' || toToken !== 'USDC') return []

  const fromChain = params.fromChain?.toLowerCase()
  const toChain = params.toChain?.toLowerCase()

  // Must be cross-chain
  if (!fromChain || !toChain || fromChain === toChain) return []

  // Both chains must be supported by CCTP
  if (!SUPPORTED_BRIDGE_CHAINS.includes(fromChain) || !SUPPORTED_BRIDGE_CHAINS.includes(toChain)) {
    return []
  }

  // Check cache
  const cacheKey = `cctp:${fromChain}:${toChain}:${params.amount}`
  const cached = getCached<RouteOption[]>(cacheKey)
  if (cached) return cached

  try {
    const routes = await fetchCCTPQuote({
      srcChain: CIRCLE_CHAIN_IDS[fromChain],
      dstChain: CIRCLE_CHAIN_IDS[toChain],
      amount: params.amount,
      fromAddress: params.fromAddress,
    })

    const result = routes.map((route, i) => {
      const srcName = CHAIN_NAMES[route.srcChain] ?? String(route.srcChain)
      const dstName = CHAIN_NAMES[route.dstChain] ?? String(route.dstChain)

      return {
        id: `cctp-${srcName}-${dstName}-${i}`,
        path: `USDC on ${capitalize(srcName)} -> USDC on ${capitalize(dstName)} via CCTP V2`,
        fee: `$${Number(route.fee).toFixed(2)}`,
        estimatedTime: formatTime(route.estimatedTime),
        provider: 'Circle CCTP',
      } satisfies RouteOption
    })

    setCache(cacheKey, result)
    return result
  } catch (error) {
    console.error('[Circle Bridge] Route fetch failed:', error)
    return [
      {
        id: 'cctp-error',
        path: error instanceof Error ? error.message : 'Failed to fetch CCTP route',
        fee: 'N/A',
        estimatedTime: 'N/A',
        provider: 'Circle CCTP',
      },
    ]
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a quote from the Circle Bridge Kit API.
 *
 * In production this would call the Bridge Kit SDK:
 *   import { BridgeKit } from '@circle-fin/bridge-kit'
 *   const kit = new BridgeKit({ apiKey: process.env.CIRCLE_API_KEY })
 *   const quote = await kit.getQuote(...)
 *
 * We wrap this in a standalone function so it can be swapped for the real
 * SDK call once the API key is provisioned.
 */
async function fetchCCTPQuote(params: {
  srcChain: number
  dstChain: number
  amount: string
  fromAddress?: string
}): Promise<CCTPQuoteResponse['routes']> {
  const apiKey = process.env.CIRCLE_API_KEY

  if (apiKey) {
    // Real API call to Circle Bridge Kit
    const res = await fetch('https://api.circle.com/v1/bridge/quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        sourceChain: params.srcChain,
        destinationChain: params.dstChain,
        amount: params.amount,
        sourceToken: 'USDC',
        destinationToken: 'USDC',
        sender: params.fromAddress,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Circle Bridge API ${res.status}: ${text}`)
    }

    const data = (await res.json()) as CCTPQuoteResponse
    return data.routes
  }

  // Fallback: return a deterministic quote for dev/demo purposes.
  // CCTP V2 transfers are near-instant with minimal fees.
  const amountNum = parseFloat(params.amount)
  const fee = Math.max(0.01, amountNum * 0.0001) // ~0.01% or $0.01 min

  return [
    {
      srcChain: params.srcChain,
      dstChain: params.dstChain,
      amount: params.amount,
      fee: fee.toFixed(4),
      estimatedTime: 30, // ~30 seconds for CCTP V2
    },
  ]
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`
  return `~${Math.ceil(seconds / 60)} min`
}
