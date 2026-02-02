import { createConfig, getQuote } from '@lifi/sdk'
import type { ParsedIntent } from '@/lib/types'
import { CHAIN_MAP, getTokenAddress, getTokenDecimals } from './tokens'

// Ensure LI.FI SDK is configured
createConfig({ integrator: 'payagent' })

export type TransactionData = {
  to: string
  data: string
  value: string
  chainId: number
  gasLimit?: string
}

/**
 * Given a parsed intent and the user's wallet address, fetches a quote from
 * LI.FI that includes the transaction calldata ready for signing.
 */
export async function getTransactionData(
  intent: ParsedIntent,
  fromAddress: string,
  slippage?: number
): Promise<TransactionData> {
  const fromChainId = CHAIN_MAP[intent.fromChain || 'ethereum'] || CHAIN_MAP.ethereum
  const toChainId =
    CHAIN_MAP[intent.toChain || intent.fromChain || 'ethereum'] || fromChainId

  const fromTokenAddr = getTokenAddress(intent.fromToken, fromChainId)
  const toTokenAddr = getTokenAddress(intent.toToken, toChainId)

  if (!fromTokenAddr || !toTokenAddr) {
    throw new Error(
      `Unsupported token: ${intent.fromToken} or ${intent.toToken}`
    )
  }

  const decimals = getTokenDecimals(intent.fromToken)
  const amountWei = BigInt(
    Math.floor(parseFloat(intent.amount) * 10 ** decimals)
  ).toString()

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

  return {
    to: txRequest.to,
    data: txRequest.data,
    value: txRequest.value?.toString() || '0',
    chainId: txRequest.chainId || fromChainId,
    gasLimit: txRequest.gasLimit?.toString(),
  }
}
