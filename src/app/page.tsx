import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F8F7F4] flex flex-col">
      {/* Nav */}
      <nav className="border-b border-[#E4E2DC] bg-[#F8F7F4]/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="FlowFi" className="w-7 h-7 rounded-lg" />
            <span className="text-sm font-semibold text-[#1C1B18]">FlowFi</span>
          </div>
          <Link
            href="/app"
            className="px-4 py-1.5 bg-[#1C1B18] text-[#F8F7F4] text-sm font-medium rounded-lg hover:bg-[#2D2C28] transition-colors"
          >
            Launch App
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-xl text-center py-20">
          <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl text-[#1C1B18] mb-4 leading-tight">
            Accept any token.<br />Earn yield.
          </h1>
          <p className="text-[#6B6A63] mb-8">
            Senders pay with any token. You receive USDC in your vault.<br />
            <span className="text-[#1C1B18]">No scattered tokens. No manual swaps. No idle funds.</span>
          </p>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#1C1B18] text-[#F8F7F4] font-medium rounded-xl hover:bg-[#2D2C28] transition-all"
          >
            Get Started
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-60">
              <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>

          {/* Features */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-12 text-sm">
            <div className="text-center">
              <p className="font-semibold text-[#1C1B18]">Any token, any chain</p>
              <p className="text-[#9C9B93]">LI.FI</p>
            </div>
            <div className="hidden sm:block w-px h-8 bg-[#E4E2DC]" />
            <div className="text-center">
              <p className="font-semibold text-[#22C55E]">Up to 5% APY</p>
              <p className="text-[#9C9B93]">Aave · Morpho</p>
            </div>
            <div className="hidden sm:block w-px h-8 bg-[#E4E2DC]" />
            <div className="text-center">
              <p className="font-semibold text-[#1C1B18]">ENS as config</p>
              <p className="text-[#9C9B93]">Uniswap V4</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E4E2DC] py-4">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-xs text-[#9C9B93]">
          <span>Unaudited. Use at own risk.</span>
          <a
            href="https://github.com/edwardtay/hack-money"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#1C1B18]"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  )
}
