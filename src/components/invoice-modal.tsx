'use client'

import { useState } from 'react'
import { useSendTransaction, useSwitchChain, useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

interface Invoice {
  id: string
  amount: string
  token: string
  memo?: string
  createdAt: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  receiverAddress: string
  receiverEns?: string
}

export function InvoiceModal({ isOpen, onClose, receiverAddress, receiverEns }: Props) {
  const { chainId } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()

  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [creating, setCreating] = useState(false)
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null)
  const [invoiceData, setInvoiceData] = useState<Invoice | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ENS storage state
  const [storingToEns, setStoringToEns] = useState(false)
  const [ensStored, setEnsStored] = useState(false)
  const [ensTxHash, setEnsTxHash] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Enter a valid amount')
      return
    }

    setCreating(true)
    setError(null)

    try {
      const res = await fetch('/api/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverAddress,
          receiverEns,
          amount,
          token: 'USDC',
          memo: memo || undefined,
          expiresInHours: 72, // 3 days
        }),
      })

      if (!res.ok) throw new Error('Failed to create invoice')
      const invoice = await res.json()

      const url = `${window.location.origin}/invoice/${invoice.id}`
      setInvoiceUrl(url)
      setInvoiceData(invoice)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create invoice')
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = () => {
    if (invoiceUrl) {
      navigator.clipboard.writeText(invoiceUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleStoreToEns = async () => {
    if (!receiverEns || !invoiceData) return

    setStoringToEns(true)
    setError(null)

    try {
      // Switch to Ethereum mainnet for ENS
      if (chainId !== 1) {
        await switchChainAsync({ chainId: 1 })
      }

      // Get ENS transaction data
      const res = await fetch('/api/invoice/ens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ensName: receiverEns,
          invoice: invoiceData,
        }),
      })

      if (!res.ok) throw new Error('Failed to build ENS transaction')
      const txData = await res.json()

      // Send the transaction
      const hash = await sendTransactionAsync({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: BigInt(0),
      })

      setEnsTxHash(hash)
      setEnsStored(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to store in ENS')
    } finally {
      setStoringToEns(false)
    }
  }

  const handleReset = () => {
    setAmount('')
    setMemo('')
    setInvoiceUrl(null)
    setInvoiceData(null)
    setError(null)
    setEnsStored(false)
    setEnsTxHash(null)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => {
          handleReset()
          onClose()
        }}
      />

      {/* Modal */}
      <Card className="relative z-10 w-full max-w-md border-[#E4E2DC] bg-white">
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-[#1C1B18]">
              {invoiceUrl ? 'Invoice Created' : 'Request Payment'}
            </h2>
            <button
              onClick={() => {
                handleReset()
                onClose()
              }}
              className="w-8 h-8 rounded-full hover:bg-[#F8F7F4] flex items-center justify-center"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#6B6960]">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {invoiceUrl ? (
            // Success state
            <div className="space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-[#EDF5F0] flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-[#22C55E]">
                  <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>

              <p className="text-center text-[#6B6960]">
                Share this link to request <span className="font-medium text-[#1C1B18]">{parseFloat(amount).toLocaleString()} USDC</span>
              </p>

              <div className="p-3 bg-[#F8F7F4] rounded-lg">
                <p className="font-mono text-sm text-[#1C1B18] break-all">{invoiceUrl}</p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  className="flex-1 border-[#E4E2DC]"
                >
                  {copied ? 'Copied!' : 'Copy Link'}
                </Button>
                <Button
                  onClick={async () => {
                    if (navigator.share) {
                      try {
                        await navigator.share({
                          title: `Payment Request: ${amount} USDC`,
                          text: memo || `Please pay ${amount} USDC`,
                          url: invoiceUrl,
                        })
                      } catch {}
                    } else {
                      handleCopy()
                    }
                  }}
                  className="flex-1 bg-[#1C1B18] hover:bg-[#2D2C28] text-white"
                >
                  Share
                </Button>
              </div>

              {/* Store in ENS option - only for ENS users */}
              {receiverEns && !ensStored && (
                <div className="pt-3 border-t border-[#E4E2DC]">
                  <Button
                    onClick={handleStoreToEns}
                    disabled={storingToEns}
                    variant="outline"
                    className="w-full h-10 border-[#5298FF] text-[#5298FF] hover:bg-[#5298FF]/10"
                  >
                    {storingToEns ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin w-4 h-4 border-2 border-[#5298FF] border-t-transparent rounded-full" />
                        Storing in ENS...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Store in ENS (permanent)
                      </span>
                    )}
                  </Button>
                  <p className="text-xs text-center text-[#9C9B93] mt-2">
                    Store invoice hash on-chain in your ENS record
                  </p>
                </div>
              )}

              {/* ENS stored confirmation */}
              {ensStored && (
                <div className="pt-3 border-t border-[#E4E2DC]">
                  <div className="flex items-center justify-center gap-2 text-[#5298FF] text-sm">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Stored in ENS
                  </div>
                  {ensTxHash && (
                    <a
                      href={`https://etherscan.io/tx/${ensTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-center text-[#6B6960] hover:text-[#5298FF] mt-1"
                    >
                      View transaction →
                    </a>
                  )}
                  <p className="text-xs text-center text-[#9C9B93] mt-2">
                    Record: ensio.invoice.{invoiceData?.id}
                  </p>
                </div>
              )}

              <button
                onClick={handleReset}
                className="w-full text-center text-sm text-[#6B6960] hover:text-[#1C1B18]"
              >
                Create another
              </button>
            </div>
          ) : (
            // Form state
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1C1B18] mb-1.5">
                  Amount
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pr-16 h-12 border-[#E4E2DC] focus:border-[#1C1B18]"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-[#6B6960]">
                    USDC
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1C1B18] mb-1.5">
                  Memo <span className="text-[#9C9B93]">(optional)</span>
                </label>
                <Input
                  type="text"
                  placeholder="What's this for?"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  maxLength={100}
                  className="h-12 border-[#E4E2DC] focus:border-[#1C1B18]"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <Button
                onClick={handleCreate}
                disabled={creating || !amount}
                className="w-full h-12 bg-[#1C1B18] hover:bg-[#2D2C28] text-white font-medium"
              >
                {creating ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Creating...
                  </span>
                ) : (
                  'Create Invoice'
                )}
              </Button>

              <p className="text-xs text-center text-[#9C9B93]">
                Invoice expires in 3 days
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
