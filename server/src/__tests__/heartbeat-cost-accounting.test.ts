import { describe, expect, it } from "vitest";
import {
  resolveCacheAdjustedCostUsd,
  resolveLightRegistryCostUsd,
  resolveLedgerCostStatus,
} from "../services/heartbeat.js";

describe("heartbeat cost accounting", () => {
  it("marks token-bearing CLI usage without a reported cost as unpriced", () => {
    expect(resolveLedgerCostStatus({
      costUsd: null,
      inputTokens: 2_732_577,
      cachedInputTokens: 2_632_998,
      outputTokens: 32_644,
    })).toBe("unpriced");
  });

  it("marks reported CLI cost as priced", () => {
    expect(resolveLedgerCostStatus({
      costUsd: 1.25,
      inputTokens: 2_090,
      cachedInputTokens: 300_000,
      outputTokens: 77_000,
    })).toBe("reported");
  });

  it("treats subscription-included usage as reported zero billed cost", () => {
    expect(resolveLedgerCostStatus({
      costUsd: null,
      billingType: "subscription_included",
      inputTokens: 72_000,
      cachedInputTokens: 0,
      outputTokens: 700,
    })).toBe("reported");
  });

  it("uses an explicit cache-adjusted provider cost when available", () => {
    expect(resolveCacheAdjustedCostUsd({
      costUsd: 1.25,
      cacheAdjustedCostUsd: 0.92,
    })).toBe(0.92);
  });

  it("attributes provider-reported billed cost as cache-adjusted by default", () => {
    expect(resolveCacheAdjustedCostUsd({
      costUsd: 1.25,
      cacheAdjustedCostUsd: null,
    })).toBe(1.25);
  });

  it("does not attribute invalid or unavailable costs", () => {
    expect(resolveCacheAdjustedCostUsd({
      costUsd: null,
      cacheAdjustedCostUsd: Number.NaN,
    })).toBeNull();
  });

  it("prices a run that only reports a cache-adjusted cost", () => {
    const billedCostUsd = resolveCacheAdjustedCostUsd({
      costUsd: null,
      cacheAdjustedCostUsd: 0.42,
    });
    expect(billedCostUsd).toBe(0.42);
    expect(resolveLedgerCostStatus({
      costUsd: billedCostUsd,
      inputTokens: 1_000,
      cachedInputTokens: 900_000,
      outputTokens: 5_000,
    })).toBe("reported");
  });

  it("bills the discounted amount when both nominal and cache-adjusted costs are reported", () => {
    expect(resolveCacheAdjustedCostUsd({
      costUsd: 3.1,
      cacheAdjustedCostUsd: 1.5,
    })).toBe(1.5);
  });

  it("uses configured Light model prices when a metered provider reports zero", () => {
    expect(resolveLightRegistryCostUsd({
      reportedCostUsd: 0,
      billingType: "unknown",
      provider: "umans",
      model: "umans/umans-deepseek-v4-flash-0731",
      usage: { inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 1_000_000 },
      companyConfig: {
        ...({} as any),
        modelRegistry: [{
          provider: "umans",
          modelId: "umans-deepseek-v4-flash-0731",
          inputPricePerMillion: 0.14,
          cachedInputPricePerMillion: 0.028,
          outputPricePerMillion: 0.28,
        }],
      },
    })).toBeCloseTo(0.448);
  });

  it("does not estimate subscription-included usage from the registry", () => {
    expect(resolveLightRegistryCostUsd({
      reportedCostUsd: null,
      billingType: "subscription_included",
      provider: "umans",
      model: "umans-deepseek-v4-flash-0731",
      usage: { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0 },
      companyConfig: { ...({} as any), modelRegistry: [] },
    })).toBeNull();
  });
});
