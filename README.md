# PayAgent

AI payment agent for humans and machines. Pay anyone by name, on any chain.

## Architecture

```
FRONTEND (Next.js 16 + Tailwind v4 + shadcn/ui)
├── Chat interface (natural language input)
├── Route visualizer (chain path diagram)
└── Wallet connection (RainbowKit + wagmi)

BACKEND (Next.js API routes)
├── AI Intent Parser (Claude API → structured JSON)
├── Route Engine (LI.FI + Circle Bridge Kit)
├── ENS Resolver (viem — name resolution + payment preferences)
└── x402 Client (detect HTTP 402 paywalls, auto-pay)

ON-CHAIN (Foundry / Solidity)
└── PayAgentHook (Uniswap v4 beforeSwap intent resolver)
```

## Features

**AI Chat Interface** — Natural language → structured transaction intents via Claude API. Supports transfers, swaps, and autonomous payments.

**Cross-Chain Routing** — Finds optimal routes across Ethereum, Arbitrum, Base, and Optimism. Circle Bridge Kit for USDC-native transfers, LI.FI for multi-token swaps.

**ENS Resolution** — Resolves `.eth` names to addresses. Reads custom ENS text records (`com.payagent.chain`, `com.payagent.token`) for receiver payment preferences.

**x402 Autonomous Payments** — Detects HTTP 402 paywalled resources, extracts payment requirements, and handles payment automatically via Circle Developer Wallets.

**Uniswap v4 Hook** — `PayAgentHook` with `beforeSwap`/`afterSwap` hooks. AI-driven dynamic fees for same-chain stablecoin swaps.

## Demo Flows

1. **Pay by name**: "pay vitalik.eth 100 USDC" — resolves ENS, finds cheapest route, executes
2. **Cross-token payment**: "pay bob.eth 50 USDT" — swaps + bridges in one transaction via LI.FI Composer
3. **Machine payment**: Agent hits 402 paywall → auto-pays with Circle wallet → gets data

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Foundry (for contracts)

### Setup

```bash
pnpm install
cp .env.local.example .env.local
# Fill in: ANTHROPIC_API_KEY, NEXT_PUBLIC_WC_PROJECT_ID, ETH_RPC_URL
pnpm dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for intent parsing |
| `NEXT_PUBLIC_WC_PROJECT_ID` | No | WalletConnect project ID (defaults to "demo") |
| `ETH_RPC_URL` | No | Ethereum RPC URL for ENS resolution (defaults to llamarpc) |

### Contracts

```bash
cd contracts
forge build
forge test -vv
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| AI | Claude API (@anthropic-ai/sdk) |
| Cross-chain | LI.FI SDK + Circle Bridge Kit |
| ENS | viem (getEnsAddress, getEnsText) |
| Wallets | RainbowKit + wagmi v2 + viem |
| x402 | HTTP 402 Payment Required protocol |
| Contracts | Foundry + Uniswap v4-core/v4-periphery |

## License

MIT
