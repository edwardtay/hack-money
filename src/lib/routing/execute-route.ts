import { createConfig, getQuote } from '@lifi/sdk'
import type { ParsedIntent, RouteType } from '@/lib/types'
import {
  CHAIN_MAP,
  getTokenAddress,
  getTokenDecimals,
  getVaultTokenAddress,
  isVaultToken,
} from './tokens'

// Ensure LI.FI SDK is configured
createConfig({ integrator: 'payagent' })

export type TransactionData = {
  to: string
  data: string
  value: string
  chainId: number
  gasLimit?: string
  /** Indicates the type of route this transaction was built from */
  routeType: RouteType
}

// ---------------------------------------------------------------------------
// Internal: resolve token addresses and amounts shared by both paths
// ---------------------------------------------------------------------------

function resolveParams(intent: ParsedIntent) {
  const fromChainId =
    CHAIN_MAP[intent.fromChain || 'ethereum'] || CHAIN_MAP.ethereum
  const toChainId =
    CHAIN_MAP[intent.toChain || intent.fromChain || 'ethereum'] || fromChainId

  const fromTokenAddr = getTokenAddress(intent.fromToken, fromChainId)

  const decimals = getTokenDecimals(intent.fromToken)
  const amountWei = BigInt(
    Math.floor(parseFloat(intent.amount) * 10 ** decimals)
  ).toString()

  return { fromChainId, toChainId, fromTokenAddr, decimals, amountWei }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Given a parsed intent and the user's wallet address, fetches a quote from
 * LI.FI that includes the transaction calldata ready for signing.
 *
 * Automatically detects whether the intent targets a vault (Composer) or a
 * standard transfer/swap and builds the appropriate quote request.
 */
export async function getTransactionData(
  intent: ParsedIntent,
  fromAddress: string,
  slippage?: number
): Promise<TransactionData> {
  const isComposerIntent =
    intent.action === 'deposit' || intent.action === 'yield'

  if (isComposerIntent) {
    return getComposerTransactionData(intent, fromAddress, slippage)
  }

  return getStandardTransactionData(intent, fromAddress, slippage)
}

// ---------------------------------------------------------------------------
// Standard transfer / swap execution
// ---------------------------------------------------------------------------

async function getStandardTransactionData(
  intent: ParsedIntent,
  fromAddress: string,
  slippage?: number
): Promise<TransactionData> {
  const { fromChainId, toChainId, fromTokenAddr, amountWei } =
    resolveParams(intent)

  const toTokenAddr = getTokenAddress(intent.toToken, toChainId)

  if (!fromTokenAddr || !toTokenAddr) {
    throw new Error(
      `Unsupported token: ${intent.fromToken} or ${intent.toToken}`
    )
  }

  const quote = await getQuote({
    fromChain: fromChainId,
    fromToken: fromTokenAddr,
    fromAddress,
    fromAmount: amountWei,
    toChain: toChainId,
    toToken: toTokenAddr,
    toAddress: intent.toAddress || fromAddress,
    slippage: slippage || 0.005,
  })

  const txRequest = quote.transactionRequest
  if (!txRequest?.to || !txRequest?.data) {
    throw new Error('No transaction data returned from LI.FI quote')
  }

  // Detect if this quote resolved to a Composer route even though the intent
  // was a plain swap (e.g. user swapped to a vault token directly).
  const detectedRouteType: RouteType =
    toTokenAddr && isVaultToken(toTokenAddr) ? 'composer' : 'standard'

  return {
    to: txRequest.to,
    data: txRequest.data,
    value: txRequest.value?.toString() || '0',
    chainId: txRequest.chainId || fromChainId,
    gasLimit: txRequest.gasLimit?.toString(),
    routeType: detectedRouteType,
  }
}

// ---------------------------------------------------------------------------
// Composer execution — vault deposit / yield
// ---------------------------------------------------------------------------

async function getComposerTransactionData(
  intent: ParsedIntent,
  fromAddress: string,
  slippage?: number
): Promise<TransactionData> {
  const { fromChainId, toChainId, fromTokenAddr, amountWei } =
    resolveParams(intent)

  if (!fromTokenAddr) {
    throw new Error(`Unsupported source token: ${intent.fromToken}`)
  }

  // Determine the vault protocol — default to "aave" when not specified
  const vaultProtocol = intent.vaultProtocol || 'aave'

  // Resolve vault token on the destination chain
  const vaultTokenAddr = getVaultTokenAddress(
    vaultProtocol,
    intent.fromToken,
    toChainId
  )

  if (!vaultTokenAddr) {
    throw new Error(
      `No ${vaultProtocol} vault found for ${intent.fromToken} on chain ${toChainId}`
    )
  }

  // Composer routes use the standard getQuote endpoint — the vault token
  // address as `toToken` triggers the Composer multi-step workflow on the
  // LI.FI backend.
  const quote = await getQuote({
    fromChain: fromChainId,
    fromToken: fromTokenAddr,
    fromAddress,
    fromAmount: amountWei,
    toChain: toChainId,
    toToken: vaultTokenAddr,
    toAddress: fromAddress,
    slippage: slippage || 0.005,
  })

  const txRequest = quote.transactionRequest
  if (!txRequest?.to || !txRequest?.data) {
    throw new Error(
      'No transaction data returned from LI.FI Composer quote'
    )
  }

  // Composer routes may include additional approval steps or multi-call data.
  // The transaction structure itself is the same EVM tx — the difference is
  // that the `to` address is the Composer VM contract rather than a bridge.
  return {
    to: txRequest.to,
    data: txRequest.data,
    value: txRequest.value?.toString() || '0',
    chainId: txRequest.chainId || fromChainId,
    gasLimit: txRequest.gasLimit?.toString(),
    routeType: 'composer',
  }
}
