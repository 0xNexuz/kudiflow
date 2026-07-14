import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import type { Address } from "viem";
import { createApp } from "../src/server.js";
import type { RuntimeConfig } from "../src/config.js";
import { CELO_CAIP2_NETWORK, CELO_USDC_ADDRESS } from "../src/chain.js";

const address = "0x1111111111111111111111111111111111111111" as Address;

function config(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    port: 0,
    rpcUrl: "https://forno.celo.org",
    network: CELO_CAIP2_NETWORK,
    facilitatorUrl: "https://x402.celo.org",
    account: undefined,
    agentAddress: undefined,
    usdcAddress: CELO_USDC_ADDRESS,
    attributionTag: undefined,
    supplierAddress: undefined,
    feeRecipient: undefined,
    signalServices: {
      stock: { url: undefined, payTo: undefined, price: "$0.003" },
      delivery: { url: undefined, payTo: undefined, price: "$0.002" },
      risk: { url: undefined, payTo: undefined, price: "$0.004" },
    },
    ...overrides,
  };
}

describe("KudiFlow API readiness", () => {
  it("reports missing live configuration instead of pretending to run", async () => {
    const response = await request(createApp(config())).get("/api/config").expect(200);

    assert.equal(response.body.live, false);
    assert.deepEqual(response.body.missing, [
      "AGENT_PRIVATE_KEY",
      "AGENT_WALLET_ADDRESS",
      "SUPPLIER_ADDRESS",
      "KUDIFLOW_FEE_RECIPIENT",
      "CELO_BUILDERS_ATTRIBUTION_TAG",
      "X402_STOCK_SERVICE_URL",
      "X402_STOCK_PAYTO",
      "X402_DELIVERY_SERVICE_URL",
      "X402_DELIVERY_PAYTO",
      "X402_RISK_SERVICE_URL",
      "X402_RISK_PAYTO",
    ]);
  });

  it("blocks agent runs until every live dependency is configured", async () => {
    const response = await request(createApp(config({ agentAddress: address })))
      .post("/api/runs")
      .expect(409);

    assert.equal(response.body.error, "live_config_missing");
    assert.ok(response.body.missing.includes("AGENT_PRIVATE_KEY"));
  });
});
