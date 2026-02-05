'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  buildTransakUrl,
  getDefaultOnrampConfig,
  setupTransakEventListener,
  type TransakEventData,
} from '@/lib/onramp/transak'

interface OnrampModalProps {
  isOpen: boolean
  onClose: () => void
  walletAddress: string
  fiatAmount?: number
  onOrderCompleted?: (data: TransakEventData) => void
}

export function OnrampModal({
  isOpen,
  onClose,
  walletAddress,
  fiatAmount,
  onOrderCompleted,
}: OnrampModalProps) {
  const [orderStatus, setOrderStatus] = useState<'idle' | 'pending' | 'completed' | 'failed'>('idle')
  const [orderId, setOrderId] = useState<string | null>(null)

  // Build Transak URL
  const config = getDefaultOnrampConfig(walletAddress, fiatAmount)
  const transakUrl = buildTransakUrl(config)

  // Setup event listener for Transak messages
  useEffect(() => {
    if (!isOpen) return

    const cleanup = setupTransakEventListener(
      // Order created
      (data) => {
        setOrderStatus('pending')
        setOrderId(data.status?.id || null)
      },
      // Order completed
      (data) => {
        setOrderStatus('completed')
        if (onOrderCompleted) {
          onOrderCompleted(data)
        }
      },
      // Order failed
      () => {
        setOrderStatus('failed')
      }
    )

    return cleanup
  }, [isOpen, onOrderCompleted])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setOrderStatus('idle')
      setOrderId(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#E4E2DC]">
          <div>
            <h2 className="text-lg font-semibold text-[#1C1B18]">Buy with Card</h2>
            <p className="text-sm text-[#6B6960]">
              Purchase USDC to complete your payment
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#F8F7F4] rounded-lg transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#6B6960]">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {orderStatus === 'completed' ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#EDF5F0] flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[#22C55E]">
                  <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[#1C1B18] mb-2">Purchase Complete!</h3>
              <p className="text-sm text-[#6B6960] mb-6">
                USDC has been sent to your wallet. You can now complete your payment.
              </p>
              <Button
                onClick={onClose}
                className="bg-[#1C1B18] hover:bg-[#2D2C28] text-white"
              >
                Continue to Payment
              </Button>
            </div>
          ) : orderStatus === 'failed' ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-red-600">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[#1C1B18] mb-2">Purchase Failed</h3>
              <p className="text-sm text-[#6B6960] mb-6">
                Something went wrong. Please try again.
              </p>
              <Button
                onClick={() => setOrderStatus('idle')}
                variant="outline"
                className="border-[#E4E2DC]"
              >
                Try Again
              </Button>
            </div>
          ) : (
            <>
              {/* Info banner */}
              <div className="rounded-lg bg-[#F0F4FF] border border-[#B7C7E8] p-3 mb-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#3B5998] flex items-center justify-center flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white">
                      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2"/>
                      <path d="M3 10H21" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#3B5998]">
                      Pay with credit/debit card
                    </p>
                    <p className="text-xs text-[#3B5998]/70">
                      Powered by Transak. Supports Visa, Mastercard, Apple Pay.
                    </p>
                  </div>
                </div>
              </div>

              {/* Transak iframe */}
              <div className="relative rounded-lg overflow-hidden bg-[#F8F7F4]" style={{ height: '500px' }}>
                {orderStatus === 'pending' && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                    <div className="text-center">
                      <div className="animate-spin w-8 h-8 border-2 border-[#1C1B18] border-t-transparent rounded-full mx-auto mb-3" />
                      <p className="text-sm text-[#6B6960]">Processing order...</p>
                      {orderId && (
                        <p className="text-xs text-[#9C9B93] mt-1">Order: {orderId}</p>
                      )}
                    </div>
                  </div>
                )}
                <iframe
                  src={transakUrl}
                  allow="camera;microphone;payment"
                  className="w-full h-full border-0"
                  title="Transak Onramp"
                />
              </div>

              {/* Footer note */}
              <p className="text-xs text-center text-[#9C9B93] mt-3">
                After purchase, USDC will be sent to your wallet.
                Then complete the payment to send it to the recipient.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
