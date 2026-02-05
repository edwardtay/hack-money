import { Suspense } from 'react'
import { PaymentFlow } from './payment-flow'
import Link from 'next/link'

interface Props {
  params: Promise<{ ens: string }>
  searchParams: Promise<{ amount?: string; token?: string }>
}

export default async function PayPage({ params, searchParams }: Props) {
  const { ens } = await params
  const { amount, token } = await searchParams

  return (
    <div className="min-h-screen bg-[#F8F7F4]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-[#E4E2DC] bg-[#F8F7F4]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="FlowFi" className="w-7 h-7 rounded-lg" />
            <span className="text-[15px] font-semibold tracking-tight text-[#1C1B18]">
              FlowFi
            </span>
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-6 py-12">
        <Suspense
          fallback={
            <div className="animate-pulse">
              <div className="h-8 w-48 bg-[#E4E2DC] rounded mb-4" />
              <div className="h-64 bg-[#E4E2DC] rounded-xl" />
            </div>
          }
        >
          <PaymentFlow ensName={ens} prefilledAmount={amount} prefilledToken={token} />
        </Suspense>
      </main>
    </div>
  )
}
