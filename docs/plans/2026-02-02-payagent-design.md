# PayAgent Design

**One-liner:** AI payment agent for humans and machines.

## Core Concept

PayAgent has two modes sharing the same payment engine:

**Human mode** — A chat interface where you type "pay alice.eth 50 USDC" and the agent handles everything: resolves the name, picks the cheapest route, switches chains if needed, and executes. No bridge UIs, no token approval screens, no chain selection dropdowns. You say who and how much, it does the rest.

**Machine mode** — An HTTP endpoint where any AI agent or bot can send payments programmatically. It hits a paywall (HTTP 402)? PayAgent auto-pays with its own Circle wallet and gets the data. Another service needs settlement? PayAgent receives a webhook and moves USDC cross-chain in seconds.

Both modes go through the same pipeline:

```
Input (chat or API) → Intent Parser (Claude) → ENS Resolution → Route Finding → Execution
```

The difference is just the interface layer on top.

## How Each Sponsor Fits

Each sponsor owns a clear piece of the payment pipeline — no forced integrations:

**ENS** — The identity layer. Users pay names, not addresses. `alice.eth`, `bob.base.eth`. PayAgent reads ENS text records for receiver preferences (preferred chain, preferred token) so payments arrive how the recipient wants. This is the "by name" part of the product.

**Circle (Arc)** — The money movement layer. Bridge Kit moves USDC cross-chain via CCTP V2 (native burn-and-mint, fastest/cheapest for USDC). Developer-Controlled Wallets give the machine-mode agent its own MPC wallet. Stork oracle provides price feeds for FX decisions.

**LI.FI** — The fallback routing layer. When the payment involves non-USDC tokens or needs a swap (user has USDT, recipient wants USDC on Arbitrum), LI.FI handles the multi-step workflow. Composer bundles swap + bridge into a single transaction.

**Uniswap v4** — The on-chain swap layer. When sender and recipient are on the same chain but different stablecoins, the v4 hook handles the swap with AI-driven dynamic fees. Deployed on Unichain.

```
"pay alice.eth 50 USDC on Arbitrum"
        │
   ENS resolve alice.eth → 0x..., prefers Arbitrum + USDC  ✓ match
        │
   User is on Ethereum with USDC
        │
   Route: Circle Bridge Kit (USDC→USDC cross-chain, fastest)
        │
   Fallback: LI.FI (if token mismatch or non-USDC)
        │
   Same-chain swap needed? → Uniswap v4 hook
```

## Key Flows

### Flow 1: Human pays by name

```
User: "pay vitalik.eth 100 USDC"

1. Claude parses → { action: "pay", to: "vitalik.eth", amount: "100", token: "USDC" }
2. ENS resolves vitalik.eth → 0xd8dA..., reads text records → prefers Base
3. User wallet is on Ethereum with USDC
4. PayAgent picks route:
   - Circle Bridge Kit: USDC Ethereum→Base (native CCTP, ~500ms, $0.01)
   - LI.FI: USDC Ethereum→Base (bridge aggregator, ~30s, $0.12)
5. Shows both, recommends Circle (cheaper + faster)
6. User confirms, tx executes
```

### Flow 2: Machine pays for API access (x402)

```
Agent calls: GET https://api.example.com/premium-data

1. Server returns 402 Payment Required + { amount: "0.50", token: "USDC", chain: "Base" }
2. PayAgent's Circle Developer Wallet auto-signs payment
3. PayAgent retries request with payment proof header
4. Server returns data
5. No human involved
```

### Flow 3: Cross-token payment (LI.FI + Uniswap)

```
User: "pay bob.eth 50 USDT" (user only has USDC on Ethereum, bob prefers Arbitrum)

1. Parse + ENS resolve → bob wants USDT on Arbitrum
2. Token mismatch: user has USDC, recipient wants USDT
3. Route options:
   - LI.FI Composer: swap USDC→USDT + bridge to Arbitrum (single tx)
   - Circle Bridge USDC→Arbitrum + Uniswap v4 swap USDC→USDT on Arbitrum
4. Show both, user picks
```

## Target Sponsor Tracks

| Sponsor | Track | What we show |
|---------|-------|-------------|
| Uniswap | 3A: Agentic Finance ($5K) | v4 hook with dynamic fees, deployed on Unichain, real TxIDs |
| LI.FI | 6B: AI x LI.FI ($2K) | Claude agent using LI.FI Composer for multi-step payments |
| ENS | 7A + 7B ($3.5K + $1.5K) | Name resolution + custom text records for payment preferences |
| Arc/Circle | 5A: Chain-Abstracted USDC ($5K) | Bridge Kit + Developer Wallets + Stork oracle |
