'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { ChatInterface } from '@/components/chat/chat-interface'

const SPONSOR_BADGES = [
  { label: 'Uniswap v4', color: 'bg-pink-500/15 text-pink-400 border-pink-500/25' },
  { label: 'LI.FI', color: 'bg-purple-500/15 text-purple-400 border-purple-500/25' },
  { label: 'ENS', color: 'bg-sky-500/15 text-sky-400 border-sky-500/25' },
  { label: 'x402', color: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
]

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-800 bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Title with glow */}
          <h1 className="text-xl font-semibold tracking-tight text-white relative shrink-0">
            <span className="relative z-10">PayAgent</span>
            <span className="absolute inset-0 blur-lg bg-indigo-500/20 rounded-full -z-0" />
          </h1>

          {/* Subtitle + sponsor badges (hidden on very small screens) */}
          <div className="hidden sm:flex items-center gap-2 min-w-0">
            <span className="text-xs text-gray-500 shrink-0">
              AI payment agent
            </span>
            <span className="text-gray-700 shrink-0">|</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {SPONSOR_BADGES.map((badge) => (
                <span
                  key={badge.label}
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${badge.color} transition-colors`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <ConnectButton />
      </header>

      {/* Chat area */}
      <ChatInterface />
    </div>
  )
}
