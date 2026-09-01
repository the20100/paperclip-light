import { describe, expect, it } from "vitest";
import { lightCompanyConfigSchema } from "@paperclipai/shared";
import { resolveLightModelForRun } from "./heartbeat.js";

describe("Paperclip Light deterministic model routing", () => {
  const companyConfig = lightCompanyConfigSchema.parse({
    providerHealthTtlSeconds: 300,
    modelRegistry: [
      {
        provider: "local",
        modelId: "deepseek-v4-flash",
        displayName: "DeepSeek V4 Flash",
        contextWindowTokens: 128_000,
        maxOutputTokens: 16_000,
        capabilities: ["code", "tools"],
        supportsTools: true,
        executionLocation: "local",
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        health: "available",
        lastCheckedAt: new Date("2026-08-31T11:59:00.000Z"),
        qualityScore: 75,
      },
      {
        provider: "cloud",
        modelId: "vision-model",
        displayName: "Vision model",
        contextWindowTokens: 128_000,
        maxOutputTokens: 16_000,
        capabilities: ["vision", "tools"],
        supportsTools: true,
        supportsVision: true,
        health: "unavailable",
        lastCheckedAt: new Date("2026-08-31T11:59:00.000Z"),
        qualityScore: 95,
      },
    ],
  });

  it("selects a healthy capable local model without an LLM routing call", () => {
    const result = resolveLightModelForRun({
      agentRuntimeConfig: { lightRouting: { mode: "auto", requiredCapabilities: ["code", "tools"] } },
      baseConfig: {},
      contextSnapshot: { task: "implement feature" },
      companyConfig,
      now: new Date("2026-08-31T12:00:00.000Z"),
    });
    expect(result.config.model).toBe("deepseek-v4-flash");
    expect(result.shouldPause).toBe(false);
    expect(result.metadata.decision).toBe("selected");
  });

  it("pauses with inspectable reasons when no compatible provider is available", () => {
    const result = resolveLightModelForRun({
      agentRuntimeConfig: { lightRouting: { mode: "auto", requiredCapabilities: ["vision"], onUnavailable: "pause" } },
      baseConfig: {},
      contextSnapshot: { task: "inspect screenshot" },
      companyConfig,
      now: new Date("2026-08-31T12:00:00.000Z"),
    });
    expect(result.shouldPause).toBe(true);
    expect(result.metadata.decision).toBe("pause");
    expect(result.metadata.inspected).toEqual(expect.arrayContaining([
      expect.objectContaining({ model: "deepseek-v4-flash", eligible: false, reasons: ["missing_capability"] }),
      expect.objectContaining({ model: "vision-model", eligible: false, reasons: ["provider_unavailable"] }),
    ]));
  });
});
