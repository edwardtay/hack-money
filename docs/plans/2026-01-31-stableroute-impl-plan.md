# StableRoute Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an AI-powered cross-chain stablecoin agent that parses natural language, resolves ENS names, routes via LI.FI, supports x402 autonomous payments, and includes a Uniswap v4 beforeSwap hook.

**Architecture:** Next.js app with chat UI → API routes calling Claude for NL parsing → LI.FI SDK for route finding → wagmi/viem for tx execution. Separate Foundry project for v4 hook. ENS for human-readable addresses. x402 for autonomous paywall payments.

**Tech Stack:** Next.js 14 (App Router), Tailwind + shadcn/ui, wagmi + viem + RainbowKit, @lifi/sdk, Claude API, Foundry + v4-periphery, @ensdomains/ensjs

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `next.config.js`, `tailwind.config.ts`, `tsconfig.json`
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

**Step 1: Scaffold Next.js project**

Run:
```bash
cd /home/edwardtay/1-hackathon/hack-money
npx create-next-app@latest stableroute --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
```
Expected: Project created at `stableroute/`

**Step 2: Install core dependencies**

Run:
```bash
cd /home/edwardtay/1-hackathon/hack-money/stableroute
pnpm add wagmi viem @tanstack/react-query @rainbow-me/rainbowkit @lifi/sdk @anthropic-ai/sdk
```
Expected: Packages installed

**Step 3: Install shadcn/ui**

Run:
```bash
cd /home/edwardtay/1-hackathon/hack-money/stableroute
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button input card scroll-area badge separator
```
Expected: shadcn components added

**Step 4: Initialize git and commit**

Run:
```bash
cd /home/edwardtay/1-hackathon/hack-money/stableroute
git init
git add -A
git commit -m "chore: scaffold next.js project with deps"
```

**Step 5: Verify dev server starts**

Run:
```bash
cd /home/edwardtay/1-hackathon/hack-money/stableroute
pnpm dev &
sleep 5
curl -s http://localhost:3000 | head -20
kill %1
```
Expected: HTML response from Next.js

---

## Task 2: Wagmi + RainbowKit Config

**Files:**
- Create: `src/config/wagmi.ts`
- Create: `src/app/providers.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Create wagmi config**

Create `src/config/wagmi.ts`:
```ts
import { http, createConfig, createStorage, cookieStorage } from 'wagmi'
import { mainnet, arbitrum, base, optimism } from 'wagmi/chains'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'

export const config = getDefaultConfig({
  appName: 'StableRoute',
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'demo',
  chains: [mainnet, arbitrum, base, optimism],
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
  },
})
```

**Step 2: Create providers wrapper**

Create `src/app/providers.tsx`:
```tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { type State, WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { config } from '@/config/wagmi'
import '@rainbow-me/rainbowkit/styles.css'

type Props = { children: ReactNode; initialState?: State }

export function Providers({ children, initialState }: Props) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

**Step 3: Wire providers into layout**

Modify `src/app/layout.tsx` to import Providers, wrap children, and pass `cookieToInitialState`.

**Step 4: Verify wallet connect button renders**

Add `<ConnectButton />` from `@rainbow-me/rainbowkit` to `page.tsx`. Run dev server and confirm it renders.

**Step 5: Commit**

```bash
git add src/config/wagmi.ts src/app/providers.tsx src/app/layout.tsx src/app/page.tsx
git commit -m "feat: add wagmi + rainbowkit wallet connection"
```

---

## Task 3: Chat UI Component

**Files:**
- Create: `src/components/chat/chat-interface.tsx`
- Create: `src/components/chat/message-bubble.tsx`
- Create: `src/lib/types.ts`
- Modify: `src/app/page.tsx`

**Step 1: Define types**

Create `src/lib/types.ts`:
```ts
export type MessageRole = 'user' | 'agent'

export type RouteOption = {
  id: string
  path: string         // e.g. "Base USDC → Arbitrum USDC"
  fee: string          // e.g. "$0.12"
  estimatedTime: string
  provider: string     // e.g. "LI.FI", "Circle CCTP", "Uniswap v4"
}

export type ParsedIntent = {
  action: 'transfer' | 'swap' | 'pay_x402'
  amount: string
  fromToken: string
  toToken: string
  toAddress?: string
  toChain?: string
  fromChain?: string
  url?: string         // for x402
}

export type Message = {
  id: string
  role: MessageRole
  content: string
  intent?: ParsedIntent
  routes?: RouteOption[]
  txHash?: string
  timestamp: number
}
```

**Step 2: Create message bubble component**

Create `src/components/chat/message-bubble.tsx` — a component that renders a single message with styling based on role (user vs agent). Agent messages show route cards if `routes` is present.

**Step 3: Create chat interface component**

Create `src/components/chat/chat-interface.tsx` — the main chat component with:
- Message list in a ScrollArea
- Input textarea at bottom
- Submit handler that calls `/api/chat` endpoint
- Loading state while AI processes

**Step 4: Wire into page**

Replace `src/app/page.tsx` content with layout: header with ConnectButton, ChatInterface filling the remaining space.

**Step 5: Verify chat UI renders**

Run dev server, confirm textarea + message area renders.

**Step 6: Commit**

```bash
git add src/components/ src/lib/types.ts src/app/page.tsx
git commit -m "feat: add chat UI components"
```

---

## Task 4: AI Intent Parser API Route

**Files:**
- Create: `src/app/api/chat/route.ts`
- Create: `src/lib/ai/parse-intent.ts`

**Step 1: Create intent parser**

Create `src/lib/ai/parse-intent.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are StableRoute, an AI that parses natural language into stablecoin transaction intents.

Given a user message, extract the intent as JSON:

{
  "action": "transfer" | "swap" | "pay_x402",
  "amount": string (numeric),
  "fromToken": string (e.g. "USDC", "USDT", "DAI"),
  "toToken": string,
  "toAddress": string | null (ENS name or 0x address),
  "toChain": string | null (e.g. "arbitrum", "base", "ethereum", "optimism"),
  "fromChain": string | null (null means auto-detect from wallet),
  "url": string | null (only for x402 actions)
}

Rules:
- If user says "send" or "transfer", action is "transfer"
- If user says "swap" or "convert" or "exchange", action is "swap"
- If user mentions a URL or "access" or "pay for", action is "pay_x402"
- If no toToken specified on transfer, assume same as fromToken
- If no fromToken specified, assume "USDC"
- Respond ONLY with valid JSON, no markdown fences`

export async function parseIntent(userMessage: string): Promise<ParsedIntent> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return JSON.parse(text)
}
```

**Step 2: Create chat API route**

Create `src/app/api/chat/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { parseIntent } from '@/lib/ai/parse-intent'

export async function POST(req: NextRequest) {
  const { message, userAddress } = await req.json()
  const intent = await parseIntent(message)

  // For now, return the parsed intent. Route finding comes in Task 5.
  return NextResponse.json({
    intent,
    agentMessage: `Got it. I'll ${intent.action} ${intent.amount} ${intent.fromToken}${
      intent.toAddress ? ` to ${intent.toAddress}` : ''
    }${intent.toChain ? ` on ${intent.toChain}` : ''}. Finding best route...`,
  })
}
```

**Step 3: Wire chat UI to call API**

Update `src/components/chat/chat-interface.tsx` submit handler to POST to `/api/chat` and display agent response.

**Step 4: Test intent parsing**

Create `.env.local` with `ANTHROPIC_API_KEY=sk-ant-...`. Start dev server. Type "send 100 USDC to vitalik.eth on arbitrum" in chat. Verify agent responds with parsed intent.

**Step 5: Commit**

```bash
git add src/app/api/chat/route.ts src/lib/ai/parse-intent.ts src/components/chat/chat-interface.tsx .env.local
# Note: add .env.local to .gitignore first
git commit -m "feat: add AI intent parser API route"
```

---

## Task 5: LI.FI Route Finding

**Files:**
- Create: `src/lib/routing/lifi-router.ts`
- Modify: `src/app/api/chat/route.ts`

**Step 1: Create LI.FI router**

Create `src/lib/routing/lifi-router.ts`:
```ts
import { createConfig, getQuote, getRoutes, ChainId } from '@lifi/sdk'

createConfig({ integrator: 'stableroute-hackmoney' })

const CHAIN_MAP: Record<string, number> = {
  ethereum: ChainId.ETH,
  arbitrum: ChainId.ARB,
  base: ChainId.BAS,
  optimism: ChainId.OPT,
}

const TOKEN_MAP: Record<string, Record<number, string>> = {
  USDC: {
    [ChainId.ETH]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    [ChainId.ARB]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    [ChainId.BAS]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    [ChainId.OPT]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  },
  USDT: {
    [ChainId.ETH]: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    [ChainId.ARB]: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    [ChainId.BAS]: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    [ChainId.OPT]: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
  },
}

export async function findRoutes(params: {
  fromAddress: string
  fromChain: string
  toChain: string
  fromToken: string
  toToken: string
  amount: string // in human-readable (e.g. "100")
}) {
  const fromChainId = CHAIN_MAP[params.fromChain] || ChainId.ETH
  const toChainId = CHAIN_MAP[params.toChain] || fromChainId
  const fromTokenAddr = TOKEN_MAP[params.fromToken]?.[fromChainId]
  const toTokenAddr = TOKEN_MAP[params.toToken]?.[toChainId]

  if (!fromTokenAddr || !toTokenAddr) {
    throw new Error(`Token not supported: ${params.fromToken} or ${params.toToken}`)
  }

  // Convert to smallest unit (6 decimals for USDC/USDT)
  const amountWei = (BigInt(Math.floor(parseFloat(params.amount) * 1e6))).toString()

  const result = await getRoutes({
    fromAddress: params.fromAddress,
    fromChainId,
    toChainId,
    fromTokenAddress: fromTokenAddr,
    toTokenAddress: toTokenAddr,
    fromAmount: amountWei,
  })

  return result.routes.map((route, i) => ({
    id: `route-${i}`,
    path: route.steps.map(s => s.toolDetails.name).join(' → '),
    fee: `$${(Number(route.gasCostUSD || '0') + Number(route.feeCosts?.reduce((a, f) => a + Number(f.amountUSD || 0), 0) || 0)).toFixed(2)}`,
    estimatedTime: `${Math.ceil((route.steps.reduce((a, s) => a + (s.estimate.executionDuration || 0), 0)) / 60)} min`,
    provider: 'LI.FI',
    lifiRoute: route,  // keep full route for execution
  }))
}
```

**Step 2: Wire route finding into chat API**

Modify `src/app/api/chat/route.ts` to call `findRoutes` after parsing intent, return route options in response.

**Step 3: Display route cards in chat**

Update message-bubble to render route cards with fee, time, provider, and a "Confirm" button for each route.

**Step 4: Test route finding**

Start dev server. Type "swap 10 USDC to USDT on arbitrum". Verify route options appear.

**Step 5: Commit**

```bash
git add src/lib/routing/lifi-router.ts src/app/api/chat/route.ts src/components/chat/
git commit -m "feat: add LI.FI cross-chain route finding"
```

---

## Task 6: Transaction Execution

**Files:**
- Create: `src/lib/routing/execute-route.ts`
- Create: `src/app/api/execute/route.ts`
- Modify: `src/components/chat/chat-interface.tsx`

**Step 1: Create execution helper**

Create `src/lib/routing/execute-route.ts` that takes a LI.FI route object and the user's wallet client (via wagmi) and calls `executeRoute` from `@lifi/sdk`.

**Step 2: Create execute API route**

Create `src/app/api/execute/route.ts` — receives selected route ID, looks it up, and returns the transaction data for the frontend to sign with the connected wallet.

**Step 3: Add confirm button handler**

Update chat-interface: when user clicks "Confirm" on a route card, call the execute flow using wagmi's `useSendTransaction` hook. Show tx hash in chat on success.

**Step 4: Test full flow end-to-end on testnet**

Connect wallet on Arbitrum Sepolia. Execute a small swap. Verify tx hash appears.

**Step 5: Commit**

```bash
git add src/lib/routing/execute-route.ts src/app/api/execute/ src/components/chat/
git commit -m "feat: add transaction execution flow"
```

---

## Task 7: ENS Resolution

**Files:**
- Create: `src/lib/ens/resolve.ts`
- Modify: `src/app/api/chat/route.ts`

**Step 1: Create ENS resolver**

Create `src/lib/ens/resolve.ts`:
```ts
import { createPublicClient, http, normalize } from 'viem'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ETH_RPC_URL || 'https://eth.llamarpc.com'),
})

export async function resolveENS(name: string): Promise<{
  address: string | null
  preferredChain?: string
  preferredToken?: string
}> {
  const address = await client.getEnsAddress({ name: normalize(name) })

  // Read ENS text records for payment preferences
  let preferredChain: string | undefined
  let preferredToken: string | undefined
  try {
    preferredChain = await client.getEnsText({
      name: normalize(name),
      key: 'com.stableroute.chain',
    }) || undefined
    preferredToken = await client.getEnsText({
      name: normalize(name),
      key: 'com.stableroute.token',
    }) || undefined
  } catch {
    // Text records not set, that's fine
  }

  return { address, preferredChain, preferredToken }
}
```

**Step 2: Wire ENS into chat API**

Modify `src/app/api/chat/route.ts`: after parsing intent, if `toAddress` ends with `.eth`, call `resolveENS`. Use resolved address for routing. If payment preferences exist, use them as defaults for chain/token.

**Step 3: Show ENS resolution in chat**

Agent message shows: "Resolved alice.eth → 0x1234...5678 (prefers USDC on Base)".

**Step 4: Test ENS resolution**

Type "send 10 USDC to vitalik.eth". Verify address resolves and route is found.

**Step 5: Commit**

```bash
git add src/lib/ens/ src/app/api/chat/route.ts
git commit -m "feat: add ENS name resolution with payment preferences"
```

---

## Task 8: x402 Payment Flow

**Files:**
- Create: `src/lib/x402/client.ts`
- Create: `src/app/api/x402-demo/route.ts` (demo paywall server)
- Modify: `src/app/api/chat/route.ts`

**Step 1: Create x402 client**

Create `src/lib/x402/client.ts`:
```ts
export type X402PaymentDetails = {
  amount: string
  token: string
  chain: string
  recipient: string
  facilitator: string
}

export async function probeX402(url: string): Promise<X402PaymentDetails | null> {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    if (res.status === 402) {
      const payHeader = res.headers.get('X-Payment') || res.headers.get('x-payment')
      if (payHeader) {
        return JSON.parse(payHeader)
      }
    }
    return null
  } catch {
    return null
  }
}

export async function accessWithPayment(url: string, paymentProof: string): Promise<Response> {
  return fetch(url, {
    headers: { 'X-Payment-Proof': paymentProof },
  })
}
```

**Step 2: Create demo paywall endpoint**

Create `src/app/api/x402-demo/route.ts` — returns HTTP 402 with `X-Payment` header containing payment details. On valid payment proof header, returns premium content.

**Step 3: Wire x402 into chat flow**

Modify chat API: when intent action is `pay_x402`, probe the URL for 402 status. If paywall detected, return payment details as a route option. After user pays, access the content and return it.

**Step 4: Test x402 flow**

Type "access the data at /api/x402-demo". Verify 402 is detected, payment prompt shown, and after mock payment, content is returned.

**Step 5: Commit**

```bash
git add src/lib/x402/ src/app/api/x402-demo/ src/app/api/chat/route.ts
git commit -m "feat: add x402 autonomous payment flow"
```

---

## Task 9: Uniswap v4 Hook

**Files:**
- Create: `contracts/` directory (Foundry project)
- Create: `contracts/src/StableRouteHook.sol`
- Create: `contracts/test/StableRouteHook.t.sol`
- Create: `contracts/script/Deploy.s.sol`

**Step 1: Initialize Foundry project**

Run:
```bash
cd /home/edwardtay/1-hackathon/hack-money/stableroute
mkdir contracts && cd contracts
forge init --no-git
forge install uniswap/v4-core
forge install uniswap/v4-periphery
```

**Step 2: Write the StableRouteHook contract**

Create `contracts/src/StableRouteHook.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";

contract StableRouteHook is BaseHook {
    using PoolIdLibrary for PoolKey;

    // Routing oracle: off-chain AI sets this
    address public oracle;

    // Swap analytics per pool
    mapping(PoolId => uint256) public swapCount;
    mapping(PoolId => uint256) public totalVolume;

    // Route recommendation from oracle
    // 0 = proceed on-chain, 1 = recommend cross-chain
    mapping(PoolId => uint8) public routeRecommendation;

    event SwapRouted(PoolId indexed poolId, bool onChain, uint256 amountIn);
    event RouteRecommendationUpdated(PoolId indexed poolId, uint8 recommendation);

    constructor(IPoolManager _poolManager, address _oracle) BaseHook(_poolManager) {
        oracle = _oracle;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function setRouteRecommendation(PoolId poolId, uint8 recommendation) external {
        require(msg.sender == oracle, "only oracle");
        routeRecommendation[poolId] = recommendation;
        emit RouteRecommendationUpdated(poolId, recommendation);
    }

    function _beforeSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        bytes calldata
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId poolId = key.toId();

        // Log the routing decision
        bool onChain = routeRecommendation[poolId] == 0;
        uint256 amountIn = params.amountSpecified > 0
            ? uint256(params.amountSpecified)
            : uint256(-params.amountSpecified);
        emit SwapRouted(poolId, onChain, amountIn);

        swapCount[poolId]++;

        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function _afterSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        PoolId poolId = key.toId();
        uint256 amountIn = params.amountSpecified > 0
            ? uint256(params.amountSpecified)
            : uint256(-params.amountSpecified);
        totalVolume[poolId] += amountIn;
        return (BaseHook.afterSwap.selector, 0);
    }
}
```

**Step 3: Write tests**

Create `contracts/test/StableRouteHook.t.sol` with basic tests:
- Hook deploys with correct permissions
- Oracle can set route recommendations
- Non-oracle cannot set recommendations
- beforeSwap emits SwapRouted event
- afterSwap increments totalVolume

**Step 4: Run tests**

```bash
cd /home/edwardtay/1-hackathon/hack-money/stableroute/contracts
forge test -vv
```
Expected: All tests pass

**Step 5: Write deploy script and deploy to testnet**

Create `contracts/script/Deploy.s.sol`. Deploy to Base Sepolia or Unichain Sepolia.

```bash
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast
```

**Step 6: Commit**

```bash
git add contracts/
git commit -m "feat: add Uniswap v4 StableRouteHook with tests"
```

---

## Task 10: Wire v4 Hook Into Frontend

**Files:**
- Create: `src/lib/routing/v4-router.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/components/chat/message-bubble.tsx`

**Step 1: Create v4 routing option**

Create `src/lib/routing/v4-router.ts` that checks if a same-chain stablecoin swap could go through the v4 hook pool. Returns it as an additional route option alongside LI.FI routes.

**Step 2: Add v4 route to chat API**

Modify chat API: for swap intents on the same chain, also query the v4 hook pool and include it as a route option.

**Step 3: Visual distinction in route cards**

Route cards from v4 show a "Uniswap v4 Hook" badge. Differentiate visually from LI.FI routes.

**Step 4: Test**

Type "swap 10 USDC to USDT". Verify both LI.FI and v4 routes appear.

**Step 5: Commit**

```bash
git add src/lib/routing/v4-router.ts src/app/api/chat/route.ts src/components/chat/
git commit -m "feat: wire Uniswap v4 hook as routing option"
```

---

## Task 11: UI Polish + Route Visualization

**Files:**
- Create: `src/components/route-visualizer.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

**Step 1: Build route visualization component**

Create `src/components/route-visualizer.tsx` — shows the selected route as a chain path diagram: `[Base] → USDC → [Bridge] → USDT → [Arbitrum]` with chain logos and arrows.

**Step 2: Add cost comparison display**

Show "You save $X.XX vs naive route" in the agent response when cross-chain routing is cheaper than single-chain.

**Step 3: Dark theme styling**

Apply dark theme with accent colors for different chains (blue=Base, orange=Arbitrum, red=Optimism, purple=Ethereum).

**Step 4: Responsive layout**

Ensure chat interface works on mobile (for judge demos on phones).

**Step 5: Commit**

```bash
git add src/components/ src/app/
git commit -m "feat: add route visualization and UI polish"
```

---

## Task 12: Deploy + Demo

**Files:**
- Create: `README.md`
- Modify: `next.config.js` (env vars)
- Create: `vercel.json` (if needed)

**Step 1: Create README**

Write README with: project description, architecture diagram (text), setup instructions, demo video link, team info, prize tracks targeted.

**Step 2: Set up environment variables**

Ensure all env vars are documented: `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_WC_PROJECT_ID`, `ETH_RPC_URL`.

**Step 3: Deploy to Vercel**

```bash
cd /home/edwardtay/1-hackathon/hack-money/stableroute
pnpm build
npx vercel --prod
```

**Step 4: Record 3-min demo video**

Demo script:
1. Show app, explain concept (30s)
2. Connect wallet (15s)
3. Demo 1: "Send 100 USDC to vitalik.eth on Arbitrum" - show ENS resolution + route finding (45s)
4. Demo 2: "Swap 50 USDT to USDC" - show v4 hook route option (30s)
5. Demo 3: "Access api.example.com/premium" - show x402 flow (30s)
6. Show architecture, mention sponsors integrated (30s)

**Step 5: Submit to ETHGlobal**

Fill out submission form with: title, description, repo link, demo video link, deployed URL.

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: final polish, README, and deploy config"
```

---

## Dependency Graph

```
Task 1 (scaffold)
  ├── Task 2 (wagmi/rainbowkit)
  │     └── Task 3 (chat UI)
  │           └── Task 4 (AI parser)
  │                 ├── Task 5 (LI.FI routes)
  │                 │     └── Task 6 (tx execution)
  │                 ├── Task 7 (ENS)
  │                 └── Task 8 (x402)
  ├── Task 9 (v4 hook) ← independent, can parallel
  │     └── Task 10 (wire v4 to frontend)
  └── Task 11 (polish) ← after all features
        └── Task 12 (deploy + demo)
```

**Parallelizable:** Task 9 (v4 hook) can run simultaneously with Tasks 5-8.
