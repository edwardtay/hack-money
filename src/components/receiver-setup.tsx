'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useGasTank } from '@/hooks/use-gas-tank'
import type { Address } from 'viem'

// Default vault: Aave USDC (safest, ~4.5% APY)
const DEFAULT_VAULT = '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB' as Address
const DEFAULT_DEPOSIT = '0.005' // ~100 payments

interface Props {
  ensName?: string
  onComplete?: () => void
}

export function ReceiverSetup({ ensName, onComplete }: Props) {
  const { address, isConnected } = useAccount()
  const gasTank = useGasTank()
  const [done, setDone] = useState(false)

  const handleActivate = async () => {
    // Set vault and deposit in one flow
    await gasTank.setDefaultVault(DEFAULT_VAULT)
    await gasTank.deposit(DEFAULT_DEPOSIT)
    setDone(true)
    onComplete?.()
  }

  if (!isConnected) {
    return (
      <Card className="border-[#E4E2DC] bg-white max-w-md mx-auto">
        <CardContent className="p-6 text-center space-y-4">
          <h2 className="text-xl font-semibold text-[#1C1B18]">
            Zero-Gas Payment Link
          </h2>
          <p className="text-sm text-[#6B6960]">
            Connect wallet. Your customers will never pay gas fees.
          </p>
          <ConnectButton />
        </CardContent>
      </Card>
    )
  }

  if (done) {
    return (
      <Card className="border-[#E4E2DC] bg-white max-w-md mx-auto">
        <CardContent className="p-6 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#22C55E] flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#1C1B18]">You&apos;re live!</h2>
            <p className="text-sm text-[#6B6960] mt-1">Share your link to get paid.</p>
          </div>

          <div className="rounded-lg bg-[#F8F7F4] p-4">
            <p className="font-mono text-[#1C1B18]">
              flowfi.xyz/pay/{ensName || address?.slice(0, 10)}
            </p>
          </div>

          <p className="text-xs text-[#6B6960]">
            {gasTank.status?.estimatedPayments || 100}+ gasless payments funded • AI agent monitoring
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-[#E4E2DC] bg-white max-w-md mx-auto">
      <CardContent className="p-6 space-y-5">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-[#1C1B18]">
            Fund Your Gas Tank
          </h2>
          <p className="text-sm text-[#6B6960] mt-1">
            One deposit. AI agent handles the rest.
          </p>
        </div>

        {/* What you get */}
        <div className="rounded-lg bg-[#F8F7F4] p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#6B6960]">Gas tank deposit</span>
            <span className="text-[#1C1B18] font-medium">0.005 ETH</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#6B6960]">Covers</span>
            <span className="text-[#1C1B18] font-medium">~100 gasless payments</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#6B6960]">AI agent</span>
            <span className="text-[#22C55E] font-medium">Auto-refills when low</span>
          </div>
        </div>

        <Button
          onClick={handleActivate}
          disabled={gasTank.txPending}
          className="w-full h-12 bg-[#1C1B18] hover:bg-[#2D2C28] text-white font-medium"
        >
          {gasTank.txPending ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              Activating...
            </span>
          ) : (
            'Activate'
          )}
        </Button>

        <p className="text-xs text-center text-[#9C9B93]">
          You can change vault or add funds later in settings.
        </p>

        {gasTank.error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {gasTank.error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
