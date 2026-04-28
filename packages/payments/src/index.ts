// TODO Phase 9 — Uniswap v3 royalty routing
//
// Functions to build:
//   swapETHForToken(token, amountIn, recipient, slippageBps?)
//     — exactInputSingle via SwapRouter02, ETH → any ERC-20
//     — fallback: if swap fails (no pool / low liquidity) send ETH directly
//   routeRoyalty(contributor, amountWei)
//     — read contributor's payment.token from ENS (packages/identity)
//     — if ETH: transfer directly; else: swapETHForToken
//
// Called by: RoyaltyVault.distribute() (keeper triggers), ChallengeManager slash resolution
//
// Contract addresses needed (Sepolia):
//   SwapRouter02: 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48  (confirm before deploy)
//   WETH9:        0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14
//
// Note: fill .local/FEEDBACK.md with real integration details — required for prize

export {}
