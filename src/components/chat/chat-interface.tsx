'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAccount, useSendTransaction } from 'wagmi'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MessageBubble } from './message-bubble'
import type { Message, RouteOption, ParsedIntent } from '@/lib/types'

export function ChatInterface() {
  const { address } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'agent',
      content:
        'PayAgent ready. Pay anyone by name, on any chain. Try "pay vitalik.eth 100 USDC" or connect your wallet to begin.',
      timestamp: Date.now(),
    },
  ])
  const [input, setInput] = useState('')
  const [slippage, setSlippage] = useState('0.5')
  const [isLoading, setIsLoading] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastRequestRef = useRef<{ message: string; address?: string } | null>(null)

  // Auto-scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading, isExecuting, scrollToBottom])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    lastRequestRef.current = { message: trimmed, address }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          userAddress: address,
          slippage: parseFloat(slippage) / 100,
        }),
      })

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`)
      }

      const data = await res.json()

      const agentMessage: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: data.content ?? data.message ?? 'I received your request.',
        intent: data.intent,
        routes: data.routes,
        txHash: data.txHash,
        timestamp: Date.now(),
      }

      setMessages((prev) => [...prev, agentMessage])
    } catch {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content:
          'Sorry, I encountered an error processing your request. The chat API is not available yet -- please try again later.',
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleRefreshRoutes = useCallback(async () => {
    if (!lastRequestRef.current || isLoading) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: lastRequestRef.current.message,
          userAddress: lastRequestRef.current.address,
          slippage: parseFloat(slippage) / 100,
        }),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()
      const refreshedMessage: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: 'Routes refreshed! Here are the latest options:',
        intent: data.intent,
        routes: data.routes,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, refreshedMessage])
    } catch {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: 'Failed to refresh routes. Please try again.',
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, slippage])

  const handleSelectRoute = async (route: RouteOption, intent?: ParsedIntent) => {
    // Add the user's selection message
    const confirmMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `I'd like to use the ${route.provider} route: ${route.path}`,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, confirmMessage])

    // Skip execution for error routes or x402 (handled separately)
    if (route.id === 'error' || route.provider === 'x402') return

    if (!address) {
      const walletMsg: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: 'Please connect your wallet first to execute this transaction.',
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, walletMsg])
      return
    }

    if (!intent) {
      const noIntentMsg: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: 'Unable to determine the transaction intent. Please try your request again.',
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, noIntentMsg])
      return
    }

    // Show confirming state
    setIsExecuting(true)
    const pendingMsg: Message = {
      id: crypto.randomUUID(),
      role: 'agent',
      content: 'Preparing transaction... Please confirm in your wallet.',
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, pendingMsg])

    try {
      // Fetch transaction data from execute API
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId: route.id,
          fromAddress: address,
          intent,
          slippage: parseFloat(slippage) / 100,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `API error: ${res.status}`)
      }

      const txData = await res.json()

      // Send the transaction via wagmi
      const hash = await sendTransactionAsync({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: txData.value ? BigInt(txData.value) : BigInt(0),
      })

      // Success - show the txHash
      const successMsg: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: 'Transaction submitted successfully!',
        txHash: hash,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, successMsg])
    } catch (err: unknown) {
      const errMessage =
        err instanceof Error ? err.message : 'Transaction failed'
      // Check for user rejection
      const isRejected =
        errMessage.toLowerCase().includes('rejected') ||
        errMessage.toLowerCase().includes('denied') ||
        errMessage.toLowerCase().includes('user refused')
      const displayMsg = isRejected
        ? 'Transaction was rejected in your wallet.'
        : `Transaction failed: ${errMessage}`

      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: displayMsg,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages area */}
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="h-full overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-1">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onSelectRoute={handleSelectRoute}
                onRefreshRoutes={handleRefreshRoutes}
              />
            ))}

            {/* Typing / executing indicator */}
            {(isLoading || isExecuting) && (
              <div className="flex justify-start mb-4">
                <div className="bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Input bar */}
      <div className="border-t border-gray-800 bg-gray-950/80 backdrop-blur-sm">
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3"
        >
          <select
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            className="h-11 px-2 bg-gray-900 border border-gray-700 text-gray-300 text-xs rounded-xl focus:ring-indigo-500/50 focus:border-indigo-500 cursor-pointer"
            title="Slippage tolerance"
          >
            <option value="0.1">0.1%</option>
            <option value="0.5">0.5%</option>
            <option value="1.0">1.0%</option>
          </select>
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              address
                ? 'Send 100 USDC to vitalik.eth on Arbitrum...'
                : 'Connect your wallet to get started...'
            }
            disabled={isLoading}
            className="flex-1 bg-gray-900 border-gray-700 text-gray-100 placeholder:text-gray-500 h-11 rounded-xl focus-visible:ring-indigo-500/50 focus-visible:border-indigo-500"
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="h-11 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium disabled:opacity-40 cursor-pointer"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </span>
            ) : (
              'Send'
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
