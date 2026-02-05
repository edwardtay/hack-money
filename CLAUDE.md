# Project Standards

## Dev Server
- Always verify the server is actually running after starting it
- Use `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` to check status
- Use `run_in_background: true` for long-running processes like dev servers
- Never assume the server is up — confirm with HTTP status code before telling the user

## Contracts
- Foundry for builds and tests — `forge build`, `forge test`
- Base mainnet (chain 8453) is the target deployment chain
- PoolManager: `0x498581fF718922c3f8e6A244956aF099B2652b2b`

## Code
- Keep changes minimal and focused — no unnecessary refactors or abstractions
- No tech stack badges, "powered by" labels, or framework name-drops in the UI

## Design
- Light theme, warm neutral palette (cream/charcoal/gold)
- Typography: Instrument Serif (display), Outfit (body), JetBrains Mono (mono)
- No purple gradients, no generic SaaS aesthetics
