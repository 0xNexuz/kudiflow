import { config as loadDotenv } from "dotenv";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import {
  CELO_CAIP2_NETWORK,
  CELO_USDC_ADDRESS,
  DEFAULT_CELO_RPC_URL,
} from "./chain.js";
import type { Network } from "@x402/core/types";

loadDotenv({ path: [".env.local", ".env"], quiet: true });

const trimInput = (value: unknown) =>
  typeof value === "string" ? value.trim() : value;
const trimmedString = z.preprocess(trimInput, z.string());
const urlString = z.preprocess(trimInput, z.string().url());
const address = trimmedString.refine(isAddress, "Expected an EVM address");
const hexPrivateKey = z.preprocess(
  trimInput,
  z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte private key"),
);
const usdcPrice = z.preprocess(
  trimInput,
  z.string()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/, "Expected a positive USDC amount with at most 6 decimals")
    .refine((value) => Number(value) > 0, "Expected a positive USDC amount"),
);

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4173),
  CELO_RPC_URL: urlString.default(DEFAULT_CELO_RPC_URL),
  CELO_NETWORK: trimmedString.pipe(z.literal("celo-mainnet")).default("celo-mainnet"),
  AGENT_PRIVATE_KEY: hexPrivateKey.optional(),
  AGENT_WALLET_ADDRESS: address.optional(),
  X402_FACILITATOR_URL: urlString.default("https://api.x402.celo.org"),
  X402_API_KEY: trimmedString.optional(),
  X402_STOCK_SERVICE_URL: urlString.optional(),
  X402_DELIVERY_SERVICE_URL: urlString.optional(),
  X402_RISK_SERVICE_URL: urlString.optional(),
  X402_STOCK_PRICE_USDC: usdcPrice.default("0.001"),
  X402_DELIVERY_PRICE_USDC: usdcPrice.default("0.002"),
  X402_RISK_PRICE_USDC: usdcPrice.default("0.004"),
  X402_STOCK_PAYTO: address.optional(),
  X402_DELIVERY_PAYTO: address.optional(),
  X402_RISK_PAYTO: address.optional(),
  SUPPLIER_ADDRESS: address.optional(),
  KUDIFLOW_FEE_RECIPIENT: address.optional(),
  CELO_BUILDERS_ATTRIBUTION_TAG: z
    .preprocess(trimInput, z.string().regex(/^[a-z0-9_]{1,32}$/))
    .optional(),
});

export type RuntimeConfig = ReturnType<typeof loadConfig>;

function normalizeAddress(value: string | undefined): Address | undefined {
  return value ? (getAddress(value) as Address) : undefined;
}

export function loadConfig(env = process.env) {
  const parsed = envSchema.parse(env);
  const account = parsed.AGENT_PRIVATE_KEY
    ? privateKeyToAccount(parsed.AGENT_PRIVATE_KEY as Hex)
    : undefined;
  const configuredAddress = normalizeAddress(parsed.AGENT_WALLET_ADDRESS);
  const derivedAddress = account?.address;

  if (
    configuredAddress &&
    derivedAddress &&
    configuredAddress.toLowerCase() !== derivedAddress.toLowerCase()
  ) {
    throw new Error("AGENT_WALLET_ADDRESS does not match AGENT_PRIVATE_KEY");
  }

  return {
    port: parsed.PORT,
    rpcUrl: parsed.CELO_RPC_URL,
    network: CELO_CAIP2_NETWORK as Network,
    facilitatorUrl: parsed.X402_FACILITATOR_URL,
    x402ApiKey: parsed.X402_API_KEY,
    account,
    agentAddress: derivedAddress ?? configuredAddress,
    usdcAddress: CELO_USDC_ADDRESS,
    attributionTag: parsed.CELO_BUILDERS_ATTRIBUTION_TAG,
    supplierAddress: normalizeAddress(parsed.SUPPLIER_ADDRESS),
    feeRecipient: normalizeAddress(parsed.KUDIFLOW_FEE_RECIPIENT),
    signalServices: {
      stock: {
        url: parsed.X402_STOCK_SERVICE_URL,
        payTo: normalizeAddress(parsed.X402_STOCK_PAYTO),
        price: `$${parsed.X402_STOCK_PRICE_USDC}`,
      },
      delivery: {
        url: parsed.X402_DELIVERY_SERVICE_URL,
        payTo: normalizeAddress(parsed.X402_DELIVERY_PAYTO),
        price: `$${parsed.X402_DELIVERY_PRICE_USDC}`,
      },
      risk: {
        url: parsed.X402_RISK_SERVICE_URL,
        payTo: normalizeAddress(parsed.X402_RISK_PAYTO),
        price: `$${parsed.X402_RISK_PRICE_USDC}`,
      },
    },
  };
}

export function missingLiveConfig(config: RuntimeConfig): string[] {
  const missing: string[] = [];
  if (!config.account) missing.push("AGENT_PRIVATE_KEY");
  if (!config.agentAddress) missing.push("AGENT_WALLET_ADDRESS");
  if (!config.supplierAddress) missing.push("SUPPLIER_ADDRESS");
  if (!config.feeRecipient) missing.push("KUDIFLOW_FEE_RECIPIENT");
  if (!config.attributionTag) missing.push("CELO_BUILDERS_ATTRIBUTION_TAG");
  if (!config.x402ApiKey) missing.push("X402_API_KEY");
  for (const [name, service] of Object.entries(config.signalServices)) {
    if (!service.url) missing.push(`X402_${name.toUpperCase()}_SERVICE_URL`);
    if (!service.payTo) missing.push(`X402_${name.toUpperCase()}_PAYTO`);
  }
  return missing;
}
