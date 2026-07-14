# KudiFlow MVP architecture

KudiFlow is a MiniPay-first procurement and FX agent for informal merchants on
Celo. A merchant provides a product request and a hard budget. The agent buys
three small pieces of information over x402 (stock, delivery, and counterparty
risk), ranks suppliers, obtains an FX quote, and produces a transaction plan.
Deterministic policy checks authorize every money-moving action before the
wallet can sign it.

## Demo path

1. Merchant connects MiniPay and asks KudiFlow to restock an item within a
   stated local-stablecoin budget.
2. The planner requests stock, shipping, and risk data from three x402-protected
   endpoints. Each paid request becomes a receipt in the run audit log.
3. The planner compares landed cost and risk, chooses a supplier, and requests
   a local-stablecoin-to-settlement-token quote.
4. The deterministic policy gate checks token, recipient allowlist, per-action
   amount, total run budget, approval threshold, and maximum slippage.
5. KudiFlow shows the proposed supplier payment, FX amount, and separately
   disclosed platform fee. The merchant approves when policy requires it.
6. The executor swaps and pays on Celo, then records transaction hashes and
   renders a shareable procurement receipt.

## Trust boundary

```text
Merchant/MiniPay
       |
       v
Planner (AI or rules) ---> x402 stock/shipping/risk services
       |
       v
Typed transaction intents
       |
       v
Deterministic policy gate ---> approval queue / denial audit
       |
       v
Executor wallet ---> Celo mainnet USDC transfers
       |
       v
Receipt store (inputs, decision, quotes, payment hashes)
```

The model never receives a private key and never directly calls the wallet. It
can only propose typed intents. The executor accepts intents with a current
policy decision and records the decision inputs alongside the transaction hash.

## Recommended stack

- TypeScript end to end; Next.js App Router for the MiniPay-friendly web app and
  server routes.
- `viem` for typed Celo reads, writes, receipts, and chain configuration.
- Celo mainnet (chain ID `42220`) with Forno RPC by default.
- x402 v2 for the three pay-per-use supplier-data calls. The app is fail-closed:
  it blocks the run until real service URLs, payTo addresses, and the Celo
  facilitator are configured.
- A server-only, narrowly funded demo agent wallet. Production should move to a
  smart-account or purpose-built vault with enforceable spending permissions.
- SQLite/Postgres for run/audit data; no chain write is required for explanatory
  metadata. Onchain hashes remain the settlement source of truth.

## Module boundaries

- `src/policy.ts`: pure authorization logic, already implemented and tested.
- `src/chain.ts`: Celo mainnet client and canonical Celo addresses.
- `src/config.ts`: server-only environment parsing and readiness checks.
- `src/agent.ts`: paid x402 fetch client, policy gate, and tagged USDC settlement.
- `src/server.ts`: Express API, x402-protected signal endpoints, and static app
  hosting.
- `src/main.ts`: frontend terminal that renders API status and real receipts only.

## Hackathon-visible Celo features

- Stablecoin-denominated procurement and FX settlement.
- Celo-native fee abstraction where the chosen wallet/client supports the
  `feeCurrency` transaction field.
- x402 micropayments with payment receipts.
- ERC-8021 attribution tagging on supported transactions.
- ERC-8004 identity/reputation link as a required final submission field.

## Implementation cautions

- Do not guess token, router, facilitator, or fee-currency adapter addresses.
  Confirm deployments on the selected network and keep them in server config.
- Treat quotes as expiring data; re-check amount, recipient, route, deadline,
  slippage, and total spend immediately before signing.
- Never let the platform fee hide inside the FX rate or supplier amount.
- Demo with a narrowly funded mainnet wallet and capped values; do not place
  treasury funds behind the hackathon executor.
