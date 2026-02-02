import { createConfig, getRoutes } from '@lifi/sdk'
import type { RouteOption } from '@/lib/types'
import { CHAIN_MAP, getTokenAddress, getTokenDecimals } from './tokens'
import { getCached, setCache } from './route-cache'

createConfig({ integrator: 'payagent' })

export async function findRoutes(params: {
  fromAddress: string
  fromChain: string
  toChain: string
  fromToken: string
  toToken: string
  amount: string
  slippage?: number
}): Promise<RouteOption[]> {
  const fromChainId = CHAIN_MAP[params.fromChain] || CHAIN_MAP.ethereum
  const toChainId = CHAIN_MAP[params.toChain] || fromChainId
  const fromTokenAddr = getTokenAddress(params.fromToken, fromChainId)
  const toTokenAddr = getTokenAddress(params.toToken, toChainId)

  if (!fromTokenAddr || !toTokenAddr) {
    return [
      {
        id: 'error',
        path: `Token not supported: ${params.fromToken} or ${params.toToken}`,
        fee: 'N/A',
        estimatedTime: 'N/A',
        provider: 'Error',
      },
    ]
  }

  const decimals = getTokenDecimals(params.fromToken)
  const amountWei = BigInt(
    Math.floor(parseFloat(params.amount) * 10 ** decimals)
  ).toString()

  const cacheKey = `${fromChainId}:${toChainId}:${fromTokenAddr}:${toTokenAddr}:${amountWei}`
  const cached = getCached<RouteOption[]>(cacheKey)
  if (cached) return cached

  try {
    const result = await getRoutes({
      fromAddress: params.fromAddress,
      fromChainId,
      toChainId,
      fromTokenAddress: fromTokenAddr,
      toTokenAddress: toTokenAddr,
      fromAmount: amountWei,
      options: {
        slippage: params.slippage || 0.005,
      },
    })

    const routes = result.routes.slice(0, 3).map((route, i) => ({
      id: `lifi-route-${i}`,
      path: route.steps.map((s) => s.toolDetails.name).join(' -> '),
      fee: `$${Number(route.gasCostUSD || '0').toFixed(2)}`,
      estimatedTime: `${Math.ceil(route.steps.reduce((a, s) => a + (s.estimate?.executionDuration || 0), 0) / 60)} min`,
      provider: 'LI.FI',
    }))
    setCache(cacheKey, routes)
    return routes
  } catch (error: unknown) {
    console.error('LI.FI route error:', error)

    let detail = 'Failed to find routes'
    if (error instanceof Error) {
      detail = error.message
    }
    // LI.FI SDK errors may carry response data
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error
    ) {
      const resp = (error as { response?: { data?: { message?: string } } }).response
      if (resp?.data?.message) {
        detail = resp.data.message
      }
    }

    return [
      {
        id: 'error',
        path: detail,
        fee: 'N/A',
        estimatedTime: 'N/A',
        provider: 'LI.FI',
      },
    ]
  }
}
