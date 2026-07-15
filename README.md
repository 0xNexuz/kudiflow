# KudiFlow

KudiFlow is an autonomous, policy-controlled procurement agent for informal
merchants on Celo. A merchant can give it a plain-language buying brief, tune
spend and trust policies, let it buy live x402 market signals, and then approve
or block a tagged USDC supplier settlement with every transaction hash visible.

The repository currently contains:

- A responsive, API-driven MiniPay-oriented agent screen.
- A custom long-form editorial frontend with six project-specific artworks.
- Editable merchant requests and presets so the agent is not locked to one
  hard-coded buying instruction.
- A visible policy desk for x402 signal caps, supplier settlement caps, approval
  thresholds, minimum reputation, verified-supplier requirements, and paid
  signal-provider allowlisting.
- A deterministic transaction authorization gate with tests, plus an in-app
  policy ledger showing whether each action is allowed, approval-gated, or
  blocked before signing.
- Celo mainnet configuration through viem.
- x402 v2 server/client wiring for paid stock, delivery, and risk signals.
- Clickable CeloScan transaction hashes for x402 signal payments and supplier
  settlement receipts.
- ERC-8021 tagged USDC supplier settlement and public ERC-8004 agent identity.
- The production architecture and event submission checklist.

The app is fail-closed. It does not fabricate receipts or hashes: the agent
screen stays blocked until the Celo mainnet wallet, x402 services, payee
addresses, x402 facilitator API key, and Celo Builders attribution tag are
configured.

## Live deployment

- App: <https://kudiflow-agent.vercel.app>
- Agent identity: <https://8004scan.io/agents/celo/9677>
- Public repository: <https://github.com/0xNexuz/kudiflow>

## What the agent can do

1. Parse a merchant restocking brief into constraints.
2. Apply deterministic policy before paying for any data.
3. Buy stock, delivery, and supplier-risk signals through live x402 payments.
4. Read the resulting signal receipts and supplier trust score.
5. Block unsafe flows, request approval for gated flows, or prepare settlement.
6. Send a tagged Celo USDC settlement only after the merchant approves.

Policy is not prompt-only. The policy engine in `src/policy.ts` evaluates each
spend intent before a transaction can be signed.

## Run locally

```bash
npm install
npm run serve
```

Then open the local URL printed by the server. Use `npm run dev` only for
frontend styling work; real agent calls require the API server.

The visual system follows a warm vintage commerce-catalog direction: tactile
paper, outlined display lettering, calligraphic editorial headings, framed
product collages, navy rules, and a persistent capsule navigation dock.

## Verify

```bash
npm run check
```

Keep `.env.local` private. The generated agent/deployer wallet is server-side
only and should be narrowly funded with Celo mainnet CELO for gas and USDC for
x402/provider/supplier payments.

Required private values are intentionally not committed:

- `AGENT_PRIVATE_KEY`
- `X402_API_KEY`
- service payee URLs/addresses when running a private deployment
