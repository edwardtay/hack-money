import { createConfig, getQuote } from '@lifi/sdk'
import type { ParsedIntent } from '@/lib/types'
import { CHAIN_MAP, getTokenAddress, getTokenDecimals } from './tokens'
import {
  findBridgeRoutes,
  CIRCLE_CHAIN_IDS,
} from '@/lib/circle/bridge'

// Ensure LI.FI SDK is configured
createConfig({ integrator: 'payagent' })

export type TransactionData = {
  to: string
  data: string
  value: string
  chainId: number
  gasLimit?: string
  /** When set, indicates the route provider that produced this tx */
  provider?: string
}

/**
 * Given a parsed intent and the user's wallet address, fetches transaction
 * data ready for signing.
 *
 * If the intent is a cross-chain USDC transfer eligible for Circle CCTP,
 * the Circle Bridge Kit path is used. Otherwise LI.FI is the fallback.
 *
 * An optional `provider` hint can force a specific execution path:
 *   - "Circle CCTP" -> always use the CCTP bridge
 *   - anything else  -> use LI.FI
 */
export async function getTransactionData(
  intent: ParsedIntent,
  fromAddress: string,
  slippage?: number,
  provider?: string
): Promise<TransactionData> {
  // ------------------------------------------------------------------
  // Circle CCTP path
  // ------------------------------------------------------------------
  if (provider === 'Circle CCTP' || await shouldUseCCTP(intent)) {
    return getCCTPTransactionData(intent, fromAddress)
  }

  // ------------------------------------------------------------------
  // Default: LI.FI path
  // ------------------------------------------------------------------
  return getLiFiTransactionData(intent, fromAddress, slippage)
}

// ---------------------------------------------------------------------------
// Circle CCTP execution
// ---------------------------------------------------------------------------

/**
 * Determine if an intent should be routed through Circle CCTP.
 * CCTP is preferred for cross-chain USDC-to-USDC transfers on supported chains.
 */
async function shouldUseCCTP(intent: ParsedIntent): Promise<boolean> {
  const fromToken = intent.fromToken?.toUpperCase()
  const toToken = intent.toToken?.toUpperCase()

  // Only USDC <-> USDC
  if (fromToken !== 'USDC' || toToken !== 'USDC') return false

  const fromChain = intent.fromChain?.toLowerCase() ?? ''
  const toChain = intent.toChain?.toLowerCase() ?? ''

  // Must be cross-chain
  if (!toChain || fromChain === toChain) return false

  // Both chains must be supported by CCTP
  if (!(fromChain in CIRCLE_CHAIN_IDS) || !(toChain in CIRCLE_CHAIN_IDS)) return false

  // Verify CCTP has a route available
  const routes = await findBridgeRoutes({
    fromChain,
    toChain,
    amount: intent.amount,
    fromToken: 'USDC',
    toToken: 'USDC',
  })

  return routes.length > 0 && routes[0].id !== 'cctp-error'
}

/**
 * Build transaction data for a Circle CCTP bridge transfer.
 *
 * In production this would call the Bridge Kit SDK to get the exact
 * calldata for the CCTP MessageTransmitter contract. For now we return
 * the essential fields so the frontend can construct the transaction.
 */
async function getCCTPTransactionData(
  intent: ParsedIntent,
  fromAddress: string
): Promise<TransactionData> {
  const fromChain = intent.fromChain?.toLowerCase() ?? 'ethereum'
  const toChain = intent.toChain?.toLowerCase() ?? 'ethereum'

  const fromChainId = CHAIN_MAP[fromChain] || CHAIN_MAP.ethereum
  const fromTokenAddr = getTokenAddress('USDC', fromChainId)

  if (!fromTokenAddr) {
    throw new Error(`USDC not available on ${fromChain}`)
  }

  const decimals = getTokenDecimals('USDC')
  const amountWei = BigInt(
    Math.floor(parseFloat(intent.amount) * 10 ** decimals)
  ).toString()

  // CCTP V2 TokenMessenger contract addresses per chain
  const TOKEN_MESSENGER: Record<string, string> = {
    ethereum: '0xBd3fa81B58Ba92a82136038B25aDec7066af3155',
    arbitrum: '0x19330d10D9Cc8751218eaf51E8885D058642E08A',
    base: '0x1682Ae6375C4E4A97e4B583BC394c861A46D8962',
    optimism: '0x2B4069517957735bE00ceE0fadAE88a26365528f',
  }

  // CCTP V2 destination domain identifiers
  const CCTP_DOMAINS: Record<string, number> = {
    ethereum: 0,
    arbitrum: 3,
    base: 6,
    optimism: 2,
  }

  const tokenMessenger = TOKEN_MESSENGER[fromChain]
  if (!tokenMessenger) {
    throw new Error(`No CCTP TokenMessenger for chain: ${fromChain}`)
  }

  const destinationDomain = CCTP_DOMAINS[toChain]
  if (destinationDomain === undefined) {
    throw new Error(`No CCTP domain for destination chain: ${toChain}`)
  }

  // Encode the depositForBurn call
  // depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken)
  const { encodeFunctionData } = await import('viem')
  const calldata = encodeFunctionData({
    abi: [
      {
        name: 'depositForBurn',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'amount', type: 'uint256' },
          { name: 'destinationDomain', type: 'uint32' },
          { name: 'mintRecipient', type: 'bytes32' },
          { name: 'burnToken', type: 'address' },
        ],
        outputs: [{ name: 'nonce', type: 'uint64' }],
      },
    ],
    functionName: 'depositForBurn',
    args: [
      BigInt(amountWei),
      destinationDomain,
      // Pad the recipient address to bytes32
      `0x000000000000000000000000${(intent.toAddress || fromAddress).slice(2)}` as `0x${string}`,
      fromTokenAddr as `0x${string}`,
    ],
  })

  return {
    to: tokenMessenger,
    data: calldata,
    value: '0',
    chainId: fromChainId,
    provider: 'Circle CCTP',
  }
}

// ---------------------------------------------------------------------------
// LI.FI execution (original path)
// ---------------------------------------------------------------------------

/**
 * Given a parsed intent and the user's wallet address, fetches a quote from
 * LI.FI that includes the transaction calldata ready for signing.
 */
async function getLiFiTransactionData(
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
    provider: 'LI.FI',
  }
}
