# YieldRoute - Pay to ENS, Auto-Deposit to Yield

## Overview

YieldRoute lets anyone pay to an ENS name with any token from any chain. Funds automatically deposit into the receiver's chosen ERC-4626 yield vault.

**The problem:** Crypto payments sit idle in wallets, losing value to inflation.

**The solution:** Receivers configure their ENS with payment preferences (chain, token, vault). Senders pay to `alice.eth` from any chain with any token. The system bridges via LI.FI, routes through a Uniswap V4 pool, and the V4 hook auto-deposits into the receiver's yield vault.

**Key insight:** ENS becomes your "payment policy" - not just an address, but instructions for how you want to be paid and where your money should work.

## Target Prizes

| Track | Prize | Fit |
|-------|-------|-----|
| Uniswap Foundation | v4 hooks | YieldHook deposits to vault |
| LI.FI | Cross-chain + DeFi | Any-token bridge + destination call |
| ENS | Creative DeFi use | Payment preferences in text records |
| Arc/Circle | CCTP usage | LI.FI routes through CCTP for USDC |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SENDER FLOW                             │
│  "Pay alice.eth $100" with ANY token (ETH, USDT, ARB, etc.)     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PAYMENT PAGE UI                            │
│  pay.yieldroute.xyz/alice.eth                                   │
│  - Resolves ENS → gets preferences (chain, token, vault)        │
│  - Sender picks any token from their wallet                     │
│  - Queries LI.FI: "swap X token → $100 USDC on Base"           │
│  - Shows total cost (amount + fees), executes on confirm        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        LI.FI BRIDGE                             │
│  - Swaps sender's token → USDC on source chain                  │
│  - Bridges USDC to Base (CCTP when optimal)                     │
│  - Destination call → YieldRouter contract                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BASE (DESTINATION CHAIN)                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  YieldRouter Contract                                      │ │
│  │  - Receives USDC from LI.FI                                │ │
│  │  - Routes through V4 pool (triggers YieldHook)             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  YieldHook (afterSwap)                                     │ │
│  │  - Reads recipient's ENS → gets vault address              │ │
│  │  - Deposits USDC into ERC-4626 vault                       │ │
│  │  - Vault shares credited to recipient                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  ERC-4626 Vault (Aave, Morpho, Moonwell, etc.)            │ │
│  │  - Recipient's shares increase automatically               │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Smart Contracts

### YieldRouter.sol

Entry point that receives LI.FI destination calls and routes through V4.

```solidity
contract YieldRouter {
    IPoolManager public poolManager;
    PoolKey public yieldPool; // USDC pool with YieldHook attached

    // Called by LI.FI after bridging
    function depositToYield(
        address recipient,    // alice.eth resolved address
        bytes32 ensNode,      // ENS node for on-chain lookup
        uint256 amount        // USDC amount
    ) external {
        // 1. Pull USDC from LI.FI executor
        USDC.transferFrom(msg.sender, address(this), amount);

        // 2. Swap through V4 pool (triggers YieldHook)
        poolManager.swap(yieldPool, swapParams, hookData);
    }
}
```

### YieldHook.sol

V4 hook that reads ENS and deposits to the recipient's chosen vault.

```solidity
contract YieldHook is BaseHook {
    // Called after swap completes
    function afterSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) external override returns (bytes4, int128) {
        // 1. Decode recipient info
        (address recipient, bytes32 ensNode) = abi.decode(hookData, (address, bytes32));

        // 2. Read vault address from ENS text record
        address vault = resolveENSVault(ensNode);

        // 3. Deposit to ERC-4626 vault, shares go to recipient
        uint256 amount = getSwapOutput(delta);
        USDC.approve(vault, amount);
        IERC4626(vault).deposit(amount, recipient);

        return (this.afterSwap.selector, 0);
    }
}
```

## ENS Integration

### Text Records

| Record Key | Example Value | Purpose |
|------------|---------------|---------|
| `yieldroute.chain` | `8453` | Preferred chain (Base) |
| `yieldroute.token` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Preferred token (USDC) |
| `yieldroute.vault` | `0x...` | ERC-4626 vault address |

### On-chain Resolution (in YieldHook)

```solidity
function resolveENSVault(bytes32 ensNode) internal view returns (address) {
    address resolver = ens.resolver(ensNode);
    string memory vaultStr = ITextResolver(resolver).text(ensNode, "yieldroute.vault");
    return parseAddress(vaultStr);
}
```

### Off-chain Resolution (in frontend)

```typescript
async function getPaymentPreferences(ensName: string) {
  const client = createPublicClient({ chain: mainnet, transport: http() })

  const address = await client.getEnsAddress({ name: normalize(ensName) })
  const vault = await client.getEnsText({ name: normalize(ensName), key: 'yieldroute.vault' })
  const chain = await client.getEnsText({ name: normalize(ensName), key: 'yieldroute.chain' })
  const token = await client.getEnsText({ name: normalize(ensName), key: 'yieldroute.token' })

  return { address, vault, chain, token }
}
```

### Fallback Behavior

- No `yieldroute.vault` → funds go directly to wallet (no yield)
- No `yieldroute.chain` → default to Base
- No `yieldroute.token` → default to USDC

## Frontend

### Receiver Config UI

**URL:** `app.yieldroute.xyz`

Features:
- Connect wallet + display ENS name
- Show payment link (pay.yieldroute.xyz/name.eth)
- Display current vault position (deposited, earned, APY)
- Configure payment preferences (chain, token, vault)
- Popular vault selector with current APYs
- Custom vault address input
- Save to ENS button (batches setText transactions)

### Sender Payment Page

**URL:** `pay.yieldroute.xyz/alice.eth`

Features:
- Resolve ENS and show recipient preferences
- Amount input (denominated in recipient's preferred token)
- Chain/token selector (sender picks from their balances)
- Real-time LI.FI quote as user types
- Fee breakdown (amount, bridge fee, gas)
- Route visualization (swap → bridge → deposit)
- Execute payment button
- Success state with transaction link

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 15 (App Router) | Both UIs |
| Styling | Tailwind CSS + shadcn/ui | UI components |
| Wallet | RainbowKit + wagmi + viem | Connection, ENS |
| Cross-chain | LI.FI SDK | Route quotes + execution |
| Contracts | Foundry + v4-template | Hook development |
| V4 | @uniswap/v4-core | Pool manager, hooks |
| Deploy | Vercel (frontend), Base (contracts) | Hosting |

## Build Phases

### Phase 1: Contracts (Days 1-2)
1. Set up Foundry + v4-template
2. YieldHook contract - afterSwap deposits to vault
3. YieldRouter contract - receives LI.FI calls, routes through V4
4. Deploy to Base Sepolia
5. Checkpoint: Manual test - call YieldRouter, funds land in vault

### Phase 2: ENS Integration (Days 3-4)
6. YieldHook reads ENS text records on-chain
7. Test with real ENS name on Sepolia
8. Checkpoint: Hook reads vault address from ENS, deposits correctly

### Phase 3: Payment Page (Days 5-6)
9. Next.js scaffold + wallet connection
10. ENS resolution (show recipient preferences)
11. LI.FI SDK - get quotes for any-token-in
12. Execute payment through LI.FI with destination call
13. Checkpoint: Pay from Arbitrum Sepolia → Base Sepolia vault works

### Phase 4: Config UI (Days 7-8)
14. ENS text record write UI
15. Vault selector (show popular vaults + APYs)
16. Display current vault position
17. Checkpoint: User can configure ENS, see their yield

### Phase 5: Polish + Demo (Days 9-10)
18. Route visualization
19. Error handling + loading states
20. Record 3-min demo video
21. Deploy to Vercel + Base mainnet (or stay testnet)
22. README + architecture diagram

## Cut List (if behind)

- Mainnet deploy → stay on testnet
- Vault position display → just show "configured"
- Multiple vault options → hardcode one vault

## Non-negotiable

- V4 hook that deposits to vault (Uniswap track)
- LI.FI cross-chain routing (LI.FI track)
- ENS text records for preferences (ENS track)
- Any-token payment works (core UX)
- Demo video
