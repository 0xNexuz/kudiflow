# KudiFlow

KudiFlow is a policy-controlled procurement and FX agent for informal merchants
on Celo. It discovers reputable suppliers, pays for stock/shipping/risk signals
over x402, compares landed costs, enforces merchant-defined limits, and settles
the selected supplier in stablecoins.

The repository currently contains:

- A responsive, API-driven MiniPay-oriented agent screen.
- A custom long-form editorial frontend with six project-specific artworks.
- A deterministic transaction authorization gate with tests.
- Celo mainnet configuration through viem.
- x402 v2 server/client wiring for paid stock, delivery, and risk signals.
- ERC-8021 tagged USDC supplier settlement.
- The production architecture and event submission checklist.

The app is fail-closed. It does not fabricate receipts or hashes: the agent
screen stays blocked until the Celo mainnet wallet, x402 services, payee
addresses, and Celo Builders attribution tag are configured.

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

## Hackathon status

The official live event record sets the deadline to **August 3, 2026 at 09:00
UTC**. An older July 20 date remains in stale event copy. The project must deploy
on Celo mainnet, use a public GitHub repository, publish an ERC-8004 identity,
and tag direct agent transactions with the ERC-8021 tag assigned at registration.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the technical design and
[`docs/SUBMISSION.md`](docs/SUBMISSION.md) for the verified checklist.
