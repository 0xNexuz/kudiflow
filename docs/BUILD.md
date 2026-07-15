# KudiFlow build documentation

KudiFlow is a Celo mainnet procurement agent for merchants. A merchant writes a
plain-language buying request, sets policy limits, lets the agent purchase live
x402 procurement signals, reviews the policy ledger, and then explicitly
approves or blocks supplier settlement.

The build is intentionally not a simulation. The production app blocks live
agent runs until the server has the wallet, x402, Celo, supplier, and attribution
configuration required to create real receipts.

## Live project

- App: https://kudiflow-agent.vercel.app
- Repository: https://github.com/0xNexuz/kudiflow
- ERC-8004 identity: https://8004scan.io/agents/celo/9677
- Network: Celo mainnet
- Agent wallet: `0x2b47A78f5396B5F89340bdC00c2517966e4f19a8`
- Attribution tag: `celo_2e4520403c6b`

## Product flow

1. Merchant enters or selects a buying brief.
2. Merchant sets spend policy:
   - maximum x402 signal spend
   - settlement amount
   - maximum supplier settlement
   - approval threshold
   - minimum supplier trust score
   - verified-supplier requirement
   - paid signal-provider allowlist toggle
3. Agent reads policy and discovers supplier context.
4. Agent buys live x402 signals:
   - stock signal
   - delivery signal
   - risk signal
5. Policy ledger shows every spend decision before supplier settlement.
6. Merchant can allow or block policy rows.
7. Merchant can block the order, or approve settlement.
8. If approved, the server sends a tagged Celo USDC supplier transfer.
9. The UI renders CeloScan-linked receipts.

## Autonomy model

KudiFlow is autonomous inside merchant-defined bounds. It can choose and buy
allowed signal data, evaluate supplier context, and prepare a supplier payment.
It cannot bypass the deterministic policy gate, and it cannot settle the
supplier after the merchant blocks the order.

The model/planner never receives the private key. The server-side executor signs
only after policy checks pass.

## Frontend

Main file: `src/main.ts`

The frontend is a single TypeScript app rendered into `#app`. It includes:

- editorial landing page
- buying brief presets
- policy desk
- live readiness state
- agent stage console
- approval/block slip
- policy ledger
- receipt book
- CeloScan transaction links

Styling lives in `src/styles.css`. The design direction is a warm vintage
commerce catalog with navy rules, tactile paper, framed art, script headings,
and a persistent capsule navigation dock.

## Backend

Main file: `src/server.ts`

The backend is an Express server that:

- exposes readiness/config endpoints
- hosts x402-protected signal endpoints
- runs the procurement agent
- settles suppliers through Celo USDC
- serves the built frontend

Important endpoints:

- `GET /api/config`
- `GET /api/health`
- `GET /api/signals/stock`
- `GET /api/signals/delivery`
- `GET /api/signals/risk`
- `POST /api/runs`
- `POST /api/settle`

## Agent logic

Main file: `src/agent.ts`

The agent:

- wraps fetch with x402 payment support
- evaluates signal-spend policy before paying for signal endpoints
- records x402 receipts
- evaluates supplier reputation and verification status
- previews settlement against merchant policy
- sends the approved supplier settlement with the Celo Builders attribution tag

Supplier settlement amount is configurable from the UI and is checked against
the merchant's maximum settlement policy before signing.

## Policy engine

Main file: `src/policy.ts`

The policy engine is pure and deterministic. It checks:

- token allowlist
- recipient allowlist
- per-action limit
- per-run limit
- approval threshold
- swap slippage bounds, where relevant

Policy decisions can be:

- `allow`
- `approval-required`
- `deny`

## Configuration

Main file: `src/config.ts`

Required production values:

- `AGENT_PRIVATE_KEY`
- `AGENT_WALLET_ADDRESS`
- `SUPPLIER_ADDRESS`
- `KUDIFLOW_FEE_RECIPIENT`
- `CELO_BUILDERS_ATTRIBUTION_TAG`
- `X402_API_KEY`
- `X402_STOCK_SERVICE_URL`
- `X402_STOCK_PAYTO`
- `X402_DELIVERY_SERVICE_URL`
- `X402_DELIVERY_PAYTO`
- `X402_RISK_SERVICE_URL`
- `X402_RISK_PAYTO`

Private values must stay out of Git. Use Vercel environment variables or a local
`.env.local` file for development.

## Public assets

The visual artwork lives in `public/assets/`.

The ERC-8004 agent metadata lives in:

```text
public/.well-known/agent.json
```

## Verification

Run:

```bash
npm run check
```

This performs:

- TypeScript typecheck
- Node tests
- server build
- frontend Vite build

## Deployment

The app is deployed to Vercel.

Production URL:

```text
https://kudiflow-agent.vercel.app
```

Deployment should happen only after tests and build pass. The short Vercel alias
should point to the latest production deployment.

## Safety notes

- The app is fail-closed when live config is missing.
- Receipts are not fabricated.
- Transaction hashes are shown only when returned by live payment/settlement
  flows.
- Merchant block prevents supplier settlement.
- Settlement uses the exact approved amount, not a hidden hardcoded value.
- The agent wallet should be narrowly funded for the intended run.
