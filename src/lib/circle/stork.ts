// ---------------------------------------------------------------------------
// Stork Oracle – real-time price feeds
// ---------------------------------------------------------------------------

const STORK_API_BASE = 'https://rest.jp.stork-oracle.network'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StorkPriceResult = {
  price: number
  timestamp: number   // Unix epoch in seconds
  confidence: number  // 0-1 scale, 1 = highest confidence
}

type StorkApiResponse = {
  data: {
    [feedId: string]: {
      stork_signed_price: {
        price: string            // encoded price as stringified integer
        timestamped_signature: {
          timestamp: number      // nanoseconds
        }
        publisher_merkle_root: string
      }
      timestamp: number          // nanoseconds
      price: string              // human-readable price string
    }
  }
}

// ---------------------------------------------------------------------------
// Feed ID mapping
// ---------------------------------------------------------------------------

/**
 * Stork feed IDs for USDC prices across different chains.
 * USDC typically tracks $1.00 but can deviate during depeg events.
 */
const USDC_FEED_IDS: Record<string, string> = {
  ethereum: 'USDCUSD',
  arbitrum: 'USDCUSD',
  base: 'USDCUSD',
  optimism: 'USDCUSD',
}

/** Common asset feed IDs for general price lookups */
const KNOWN_FEEDS: Record<string, string> = {
  USDC: 'USDCUSD',
  USDT: 'USDTUSD',
  DAI: 'DAIUSD',
  ETH: 'ETHUSD',
  BTC: 'BTCUSD',
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the latest price for a given Stork feed ID.
 *
 * @param feedId - The Stork oracle feed identifier (e.g. "USDCUSD", "ETHUSD")
 * @returns Price data with timestamp and confidence score
 */
export async function getStorkPrice(
  feedId: string
): Promise<StorkPriceResult> {
  const apiKey = process.env.STORK_API_KEY

  try {
    const url = `${STORK_API_BASE}/v1/prices/latest?assets=${encodeURIComponent(feedId)}`

    const fetchHeaders: HeadersInit = {
      Accept: 'application/json',
    }
    if (apiKey) {
      fetchHeaders['Authorization'] = `Basic ${apiKey}`
    }

    const res = await fetch(url, { headers: fetchHeaders })

    if (!res.ok) {
      // If the API is unavailable, return a sensible fallback for stablecoins
      if (isStablecoinFeed(feedId)) {
        return stablecoinFallback()
      }
      throw new Error(`Stork API error: ${res.status} ${res.statusText}`)
    }

    const data = (await res.json()) as StorkApiResponse
    const feedData = data.data[feedId]

    if (!feedData) {
      if (isStablecoinFeed(feedId)) {
        return stablecoinFallback()
      }
      throw new Error(`No data returned for feed: ${feedId}`)
    }

    const price = parseFloat(feedData.price)
    const timestampNs = feedData.timestamp
    const timestampS = Math.floor(timestampNs / 1_000_000_000)

    // Confidence based on how recent the price is (within 60s = high confidence)
    const ageSeconds = Math.floor(Date.now() / 1000) - timestampS
    const confidence = ageSeconds < 60 ? 1.0 : ageSeconds < 300 ? 0.9 : 0.7

    return { price, timestamp: timestampS, confidence }
  } catch (error) {
    console.error(`[Stork] Failed to fetch price for ${feedId}:`, error)

    // Graceful fallback for stablecoins
    if (isStablecoinFeed(feedId)) {
      return stablecoinFallback()
    }

    throw error
  }
}

/**
 * Get the current USDC price on a specific chain.
 *
 * USDC should always be ~$1.00 but during depeg events it can deviate.
 * This function queries the Stork oracle for the real-time price.
 *
 * @param chain - Chain name (ethereum, arbitrum, base, optimism)
 * @returns Price data for USDC on that chain
 */
export async function getUSDCPrice(
  chain: string
): Promise<StorkPriceResult> {
  const lowerChain = chain.toLowerCase()
  const feedId = USDC_FEED_IDS[lowerChain]

  if (!feedId) {
    throw new Error(
      `Unsupported chain for USDC price: ${chain}. ` +
      `Supported: ${Object.keys(USDC_FEED_IDS).join(', ')}`
    )
  }

  return getStorkPrice(feedId)
}

/**
 * Get the price for any known asset by symbol.
 *
 * @param symbol - Token symbol (e.g. "ETH", "BTC", "USDC")
 * @returns Price data from Stork oracle
 */
export async function getAssetPrice(
  symbol: string
): Promise<StorkPriceResult> {
  const upper = symbol.toUpperCase()
  const feedId = KNOWN_FEEDS[upper]

  if (!feedId) {
    throw new Error(
      `Unknown asset symbol: ${symbol}. ` +
      `Known assets: ${Object.keys(KNOWN_FEEDS).join(', ')}`
    )
  }

  return getStorkPrice(feedId)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isStablecoinFeed(feedId: string): boolean {
  return ['USDCUSD', 'USDTUSD', 'DAIUSD'].includes(feedId.toUpperCase())
}

function stablecoinFallback(): StorkPriceResult {
  return {
    price: 1.0,
    timestamp: Math.floor(Date.now() / 1000),
    confidence: 0.5, // lower confidence since this is a fallback
  }
}
