import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { celo } from "viem/chains";

export const DEFAULT_CELO_RPC_URL =
  "https://forno.celo.org";

export const celoNetwork = celo;
export const CELO_CHAIN_ID = 42220;
export const CELO_CAIP2_NETWORK = "eip155:42220";
export const CELO_USDC_ADDRESS =
  "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as Address;
export const ERC8004_IDENTITY_REGISTRY =
  "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as Address;
export const ERC8004_REPUTATION_REGISTRY =
  "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as Address;

export function createCeloPublicClient(
  rpcUrl = process.env.CELO_RPC_URL ?? DEFAULT_CELO_RPC_URL,
): PublicClient {
  return createPublicClient({ chain: celoNetwork, transport: http(rpcUrl) }) as PublicClient;
}

/**
 * Configuration that must be provided per deployment. Token addresses are not
 * guessed because Celo Sepolia assets and hackathon-provided deployments can change.
 */
export interface SettlementAssets {
  localStablecoin: Address;
  settlementToken: Address;
}
