import { NextRequest, NextResponse } from 'next/server'
import {
  probeX402,
  createPaymentProof,
  accessWithWalletPayment,
} from '@/lib/x402/client'
import { createAgentWallet, signPayment } from '@/lib/circle/wallet'

// ---------------------------------------------------------------------------
// POST /api/agent – Machine-mode autonomous payment endpoint
// ---------------------------------------------------------------------------
//
// Accepts: { url: string }
//
// Flow:
//   1. Probe the target URL for HTTP 402 Payment Required
//   2. If 402, use the Circle developer-controlled wallet to pay automatically
//   3. Submit the payment proof and return the unlocked data
//
// This is the "machine mode" of PayAgent: an AI or automation script can call
// this single endpoint and it will handle the entire x402 payment lifecycle.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { url } = body as { url?: string }

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "url" field. Send { "url": "https://..." }' },
        { status: 400 }
      )
    }

    // ------------------------------------------------------------------
    // Step 1: Probe the URL for 402
    // ------------------------------------------------------------------
    const paymentDetails = await probeX402(url)

    if (!paymentDetails) {
      // URL is freely accessible or returned a non-402 status.
      // Fetch and return the content directly.
      const directRes = await fetch(url)
      const data = await directRes
        .json()
        .catch(async () => ({ message: await directRes.text() }))

      return NextResponse.json({
        paid: false,
        status: directRes.status,
        data,
      })
    }

    // ------------------------------------------------------------------
    // Step 2: Resolve the agent wallet and pay
    // ------------------------------------------------------------------
    const chainToBlockchain: Record<string, string> = {
      ethereum: 'ETH',
      base: 'BASE',
      arbitrum: 'ARB',
      optimism: 'OP',
    }

    const blockchain =
      chainToBlockchain[paymentDetails.chain.toLowerCase()] ?? 'ETH-SEPOLIA'

    let wallet
    let txResult
    try {
      wallet = await createAgentWallet(blockchain)
      txResult = await signPayment(wallet.id, {
        recipient: paymentDetails.recipient,
        amount: paymentDetails.amount,
        token: paymentDetails.token,
        chain: paymentDetails.chain,
      })
    } catch (walletError) {
      // If wallet creation or signing fails (e.g. no API key), return a
      // helpful error without crashing the whole request.
      const message =
        walletError instanceof Error ? walletError.message : 'Wallet error'

      return NextResponse.json(
        {
          error: 'Failed to process payment via Circle wallet',
          detail: message,
          paymentRequired: paymentDetails,
        },
        { status: 502 }
      )
    }

    // ------------------------------------------------------------------
    // Step 3: Build proof and access the paid resource
    // ------------------------------------------------------------------
    const proof = createPaymentProof(
      wallet.address,
      paymentDetails,
      txResult.transactionHash ?? txResult.id
    )

    const result = await accessWithWalletPayment(url, proof)

    return NextResponse.json({
      paid: true,
      walletAddress: wallet.address,
      transactionId: txResult.id,
      transactionHash: txResult.transactionHash ?? null,
      transactionState: txResult.state,
      paymentDetails,
      status: result.status,
      data: result.data,
    })
  } catch (error: unknown) {
    console.error('[/api/agent] Error:', error)
    const message =
      error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
