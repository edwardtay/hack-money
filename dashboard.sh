#!/usr/bin/env bash
# Usage: bash dashboard.sh
# Live dashboard — shows git state + running dev servers

ROOT="/home/edwardtay/1-hackathon/hack-money"
MAIN="$ROOT/stableroute"

# Port assignments per worktree
declare -A PORTS=( [uniswap]=3001 [lifi]=3002 [ens]=3003 [circle]=3004 [main]=3000 )

check_server() {
  local port=$1
  if ss -tlnp 2>/dev/null | grep -q ":${port} " || lsof -i ":${port}" &>/dev/null; then
    echo "LIVE :${port}"
  else
    echo "OFF"
  fi
}

echo "═══════════════════════════════════════════════════════════════"
echo "  STABLEROUTE — WORKTREE DASHBOARD    $(date '+%H:%M:%S')"
echo "═══════════════════════════════════════════════════════════════"
echo ""

for wt in uniswap lifi ens circle; do
  dir="$ROOT/worktrees/$wt"
  branch=$(git -C "$dir" branch --show-current)
  commit=$(git -C "$dir" log --oneline -1)
  ahead=$(git -C "$dir" rev-list main..HEAD --count)
  changed=$(git -C "$dir" status --short | wc -l)
  files=$(git -C "$dir" status --short 2>/dev/null | head -5)
  server=$(check_server "${PORTS[$wt]}")

  if [ "$server" = "OFF" ]; then
    status_icon="--"
    status_color=""
  else
    status_icon="UP"
    status_color=""
  fi

  echo "  [$wt]  $branch"
  echo "  Server:  $status_icon  $server"
  echo "  HEAD:    $commit"
  echo "  Ahead:   $ahead commits  |  Dirty: $changed files"

  if [ -n "$files" ]; then
    echo "$files" | while IFS= read -r line; do echo "           $line"; done
  fi

  echo "───────────────────────────────────────────────────────────────"
done

echo ""
main_server=$(check_server "${PORTS[main]}")
echo "  [main]  main"
echo "  Server:  ${main_server}"
echo "  HEAD:    $(git -C "$MAIN" log --oneline -1)"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Start servers:  PORT=300X pnpm dev  (in each worktree)"
echo "  Ports:  main=3000  uniswap=3001  lifi=3002  ens=3003  circle=3004"
