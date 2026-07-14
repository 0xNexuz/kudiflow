# Hackathon submission checklist

Verified against the live Celo Builders event record on July 14, 2026.

## Deadline and eligibility

- Hard deadline: **August 3, 2026 at 09:00 UTC**.
- The July 20 date in older event copy is stale.
- Qualifying code must be produced during the event.
- The project must be deployed on Celo mainnet and produce verifiable activity.
- A public GitHub repository is required.
- Any agent framework is allowed.

## Best-fit tracks

### Most Revenue Generated — $3,000 in CELO

- First: $2,000; second: $1,000.
- Metric is total direct onchain volume, despite the track title.
- Every direct transaction must include the assigned ERC-8021 attribution tag.
- KudiFlow volume should come from genuine supplier settlement and disclosed fees.

### Most x402 Payments — $1,000 in CELO

- First: $700; second: $300.
- Metric is raw successful x402 payment count on Celo.
- Route settlement through `https://x402.celo.org`.
- Add the agent/payTo wallet in the submission.
- Do not mirror facilitator settlements with artificial tagged transfers.

KudiFlow can also enter the Askbots rating track ($500) and the Aigora feedback
track (ten $50 awards) after the core economic loop is live.

## Registration

1. Install the live Celo Builders skill:

   ```bash
   npx skills add https://celobuilders.xyz
   ```

2. Register the project name, public GitHub URL, and personal Telegram handle.
3. Store the returned `celo_...` ERC-8021 attribution tag securely.
4. Apply the tag to direct mainnet transactions from the first qualifying run.

## Final submission fields

- Builder name, email, social handle, team name, and agent name.
- Project name, tagline, description, selected tracks/bounties.
- Public GitHub repository URL.
- Network set to `celo-mainnet`.
- Agent/payTo wallet.
- ERC-8004 identity link from 8004scan or Celoscan.
- Public X post tagging `@CeloDevs` and `@Celo`, linking the identity.
- Contract addresses, if used.
- Explanation of how the agent helped build the project.
- Live demo URL and/or demo video (strongly recommended).
- Aigora profile/feedback URLs if entering that track.
- Review the draft, then explicitly publish it before the deadline.

## Demo acceptance path

1. A merchant requests ten solar lamps under ₦180,000.
2. KudiFlow discovers ERC-8004 suppliers and filters reputation.
3. Three useful x402 calls buy inventory, delivery, and risk signals.
4. The cheapest quote is rejected because its trust score violates policy.
5. A deterministic spend gate pauses for approval of a first-time supplier.
6. After approval, the agent swaps the required amount and pays the supplier.
7. The UI shows real explorer-linked receipts, attribution, savings, and fees.
8. A second order under a delegated cap completes without another approval.

## Official references

- Event: https://celobuilders.xyz/hackathons/agentic-payments-defai
- Rules: https://celobuilders.xyz/hackathons/agentic-payments-defai/rules
- Tracks: https://celobuilders.xyz/hackathons/agentic-payments-defai/tracks
- Submission fields: https://celobuilders.xyz/hackathons/agentic-payments-defai/submission-fields
- Leaderboard: https://dune.com/celo/agentic-payments-defai-hackathon
- ERC-8021 SDK: https://github.com/celo-org/attribution-tags
- x402: https://x402.celo.org/
- ERC-8004 guide: https://docs.celo.org/build-on-celo/build-with-ai/8004
