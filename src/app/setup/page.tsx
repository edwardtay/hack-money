'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount, usePublicClient } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Card, CardContent } from '@/components/ui/card'
import { PayPreferences } from '@/components/pay-preferences'

export default function SetupPage() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient({ chainId: 1 })
  const [ensName, setEnsName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Lookup ENS name for connected wallet
  useEffect(() => {
    if (!address || !publicClient) {
      setEnsName(null)
      return
    }

    setLoading(true)
    publicClient
      .getEnsName({ address })
      .then((name) => setEnsName(name))
      .catch(() => setEnsName(null))
      .finally(() => setLoading(false))
  }, [address, publicClient])

  return (
    <div className="min-h-screen bg-[#F8F7F4]">
      {/* Header */}
      <header className="border-b border-[#E4E2DC] bg-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-semibold text-[#1C1B18]">FlowFi</span>
          </Link>
          <ConnectButton showBalance={false} />
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-md mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-[#1C1B18] mb-2">
            Payment Preferences
          </h1>
          <p className="text-[#6B6960]">
            Set how you want to receive payments
          </p>
        </div>

        <Card className="border-[#E4E2DC] bg-white">
          <CardContent className="p-6">
            {!isConnected ? (
              <div className="text-center space-y-4">
                <p className="text-[#6B6960]">Connect wallet to set up your payment preferences</p>
                <ConnectButton />
              </div>
            ) : loading ? (
              <div className="text-center py-8">
                <span className="animate-spin inline-block w-6 h-6 border-2 border-[#1C1B18] border-t-transparent rounded-full" />
              </div>
            ) : !ensName ? (
              <div className="text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-[#FEF3C7] flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-[#F59E0B]">
                    <path d="M12 9V13M12 17H12.01M21 12C21 16.97 16.97 21 12 21C7.03 21 3 16.97 3 12C3 7.03 7.03 3 12 3C16.97 3 21 7.03 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-[#1C1B18]">No ENS name found</p>
                  <p className="text-sm text-[#6B6960] mt-1">
                    Get an ENS name to set up your payment link
                  </p>
                </div>
                <a
                  href="https://app.ens.domains"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-4 py-2 bg-[#1C1B18] text-white rounded-lg font-medium hover:bg-[#2D2C28] transition-colors"
                >
                  Get ENS Name
                </a>
              </div>
            ) : (
              <div className="space-y-6">
                {/* ENS Name Display */}
                <div className="text-center pb-4 border-b border-[#E4E2DC]">
                  <p className="text-sm text-[#6B6960]">Setting up</p>
                  <p className="text-xl font-semibold text-[#1C1B18]">{ensName}</p>
                </div>

                {/* Preferences Form */}
                <PayPreferences ensName={ensName} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Link Preview */}
        {ensName && (
          <div className="mt-6 text-center">
            <p className="text-xs text-[#9C9B93] uppercase tracking-wide mb-2">Your payment link</p>
            <p className="font-mono text-[#1C1B18] bg-white rounded-lg px-4 py-3 border border-[#E4E2DC]">
              flowfi.xyz/pay/{ensName}
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
