# StableRoute - AI-Powered Cross-Chain Stablecoin Agent

## Overview

StableRoute is an AI agent that manages stablecoin payments via natural language. Users type instructions like "send 100 USDC to alice.eth on Arbitrum" or "pay for access to api.example.com" and the agent finds the cheapest route, resolves ENS names, and executes autonomously.

## Target Prizes

| Track | Sub-track | Amount | Confidence |
|-------|-----------|--------|------------|
| Arc (Circle) | Crosschain Financial Apps | $2,500 | High |
| Arc (Circle) | Agentic Commerce | $2,500 | Medium |
| Uniswap Foundation | Agentic Finance (v4) | $2,500-$5,000 | Medium |
| LI.FI | AI x LI.FI Smart App | $2,000 | High |
| LI.FI | DeFi Integration | $1,000-$1,500 | Medium |
| ENS | Integrate ENS | share of $3,500 | High |
| ENS | Creative Use for DeFi | $1,500 | Medium |
| Finalist | Top 10 | $1,000 USDC + perks | Low-Medium |

**Ceiling: ~$22K**

## Architecture

```
FRONTEND (Next.js + Tailwind + shadcn/ui)
├── Chat interface (natural language input)
├── Route visualizer (chain path diagram)
└── Wallet connection (RainbowKit + Coinbase Wallet)

BACKEND (Next.js API routes)
├── AI Intent Parser (Claude/OpenAI → structured JSON)
├── Route Engine (LI.FI SDK for cross-chain routing)
├── ENS Resolver (resolve names + read payment preferences)
└── x402 Client (detect 402 responses, auto-pay)

ON-CHAIN (Foundry / Solidity)
├── StableRoute v4 Hook (beforeSwap intent resolver)
└── Deployed on Base Sepolia / Unichain Sepolia
```

## Core User Flows

### Flow 1: Cross-chain transfer
```
User: "Send 100 USDC to alice.eth on Arbitrum"
Agent: Resolves alice.eth → 0x...
        Checks user balance (e.g., 100 USDC on Base)
        Queries LI.FI for routes: Base USDC → Arbitrum USDC
        Shows: Route A (LI.FI bridge, $0.45 fee), Route B (Circle CCTP, $0.12 fee)
        User confirms → executes cheapest route
```

### Flow 2: Stablecoin swap
```
User: "Swap 500 USDT to USDC"
Agent: Checks best rate across chains
        If Uniswap v4 on current chain is cheapest → routes through StableRoute Hook
        If cross-chain swap is cheaper → routes through LI.FI
        Shows comparison → user confirms → executes
```

### Flow 3: Autonomous payment (x402)
```
User: "Access the premium data at api.example.com/data"
Agent: Hits endpoint → gets HTTP 402 response
        Parses: "requires 0.50 USDC on Base"
        Checks balance, routes if needed
        Pays via x402 facilitator
        Returns API response to user
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 14 (App Router) | Frontend + API routes |
| Styling | Tailwind CSS + shadcn/ui | Fast, polished UI |
| AI | Claude API (structured output) | NL → intent parsing |
| Cross-chain | LI.FI SDK (@lifi/sdk) | Route finding + execution |
| ENS | viem + @ensdomains/ensjs | Name resolution + records |
| Wallets | RainbowKit + wagmi + viem | Wallet connection |
| x402 | @coinbase/x402 | HTTP 402 payment protocol |
| Contracts | Foundry + Uniswap v4-template | Hook development |
| CCTP | Circle CCTP SDK | Native USDC cross-chain |
| Deploy | Vercel | Frontend hosting |

## Uniswap v4 Hook: StableRouteHook

A `beforeSwap` hook that checks if the on-chain swap is the optimal route:

- Reads from an off-chain oracle (the AI routing decision stored as a signed message)
- If on-chain swap is optimal → allows swap to proceed
- If cross-chain route is cheaper → reverts with routing data (agent redirects to LI.FI)
- Logs swap data in `afterSwap` for routing analytics

Deployed on testnet. ~100 lines of Solidity.

## AI Intent Parser

Input: natural language string
Output: structured JSON

```json
{
  "action": "transfer" | "swap" | "pay_x402",
  "amount": "100",
  "fromToken": "USDC",
  "toToken": "USDC",
  "toAddress": "alice.eth",
  "toChain": "arbitrum",
  "fromChain": "auto"
}
```

Uses Claude API with a system prompt + structured output schema. No agent framework needed.

## Build Phases

### Phase 1: Core Loop (Day 1-3)
1. Scaffold Next.js + Tailwind + shadcn/ui
2. Wallet connection (RainbowKit + Coinbase Wallet)
3. Chat UI component
4. AI intent parser (Claude API → structured JSON)
5. LI.FI SDK integration - query routes + execute
6. Checkpoint: "swap 100 USDC to USDT on Arbitrum" works

### Phase 2: ENS + x402 (Day 4-5)
7. ENS name resolution in intent parser
8. ENS payment preferences (text records)
9. x402 client - detect + auto-pay
10. Demo paywall server
11. Checkpoint: "Send 50 USDC to vitalik.eth" + x402 demo works

### Phase 3: Uniswap v4 Hook (Day 6-7)
12. Foundry project + v4 hook template
13. StableRouteHook contract
14. Deploy to testnet
15. Wire to frontend route display
16. Checkpoint: v4 hook visible in route options

### Phase 4: Arc/CCTP Integration (Day 7-8)
17. Circle CCTP as routing option
18. Show Arc routes for USDC-USDC transfers
19. Checkpoint: CCTP route appears when optimal

### Phase 5: Polish & Demo (Day 9-10)
20. Route visualization
21. Cost comparison display
22. Record 3-min demo video
23. README + architecture diagram
24. Deploy to Vercel

## Cut List (if behind schedule)
- Phase 4 (Arc/CCTP) - LI.FI routes through CCTP anyway
- Route animation - static diagram suffices
- Transaction history - not needed for demo

## Non-negotiable
- AI chat interface (agentic tracks)
- LI.FI SDK usage (LI.FI tracks)
- ENS with custom code (ENS tracks - not just RainbowKit)
- v4 hook on testnet (Uniswap track)
- x402 flow (agentic narrative)
- 3-min demo video (required by all sponsors)
- GitHub repo with README (required by all sponsors)
