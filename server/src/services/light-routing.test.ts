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

import {
  buildLightAdapterSwitchConfig,
  inferLightAdapterTypeFromModel,
  normalizeLightModelForAdapter,
  parseLightModelAdapterPrefix,
  resolveLightAdapterSwitchForRun,
  resolveLightRetryAdapterSwitch,
} from "./heartbeat.js";

describe("Paperclip Light adapter routing", () => {
  const knownAdapterTypes = new Set(["claude_local", "codex_local", "opencode_local"]);
  const codexAgent = {
    agentAdapterType: "codex_local",
    agentAdapterConfig: {
      model: "gpt-5.6-sol",
      command: "codex",
      env: { DOKPLOY_API_KEY: { type: "secret_ref", secretId: "s1", version: "latest" } },
      instructionsFilePath: "/agents/cto/AGENTS.md",
      paperclipSkillSync: { desiredSkills: ["local/x/dokploy"] },
    },
  };

  it("parses an explicit adapter prefix only for known adapter types", () => {
    expect(parseLightModelAdapterPrefix("claude_local:claude-sonnet-5", knownAdapterTypes))
      .toEqual({ model: "claude-sonnet-5", adapterType: "claude_local" });
    expect(parseLightModelAdapterPrefix("arn:aws:bedrock:us-east-1::foundation-model/x", knownAdapterTypes))
      .toEqual({ model: "arn:aws:bedrock:us-east-1::foundation-model/x", adapterType: null });
    expect(parseLightModelAdapterPrefix("opencode_local:umans/umans-deepseek-v4-flash-0731"))
      .toEqual({ model: "umans/umans-deepseek-v4-flash-0731", adapterType: "opencode_local" });
  });

  it("infers the adapter from the model id and canonicalizes Claude aliases", () => {
    expect(inferLightAdapterTypeFromModel("sonnet-5")).toBe("claude_local");
    expect(inferLightAdapterTypeFromModel("claude-opus-5")).toBe("claude_local");
    expect(inferLightAdapterTypeFromModel("gpt-5.6-terra")).toBe("codex_local");
    expect(inferLightAdapterTypeFromModel("umans/umans-deepseek-v4-flash-0731")).toBeNull();
    expect(normalizeLightModelForAdapter("sonnet-5", "claude_local")).toBe("claude-sonnet-5");
    expect(normalizeLightModelForAdapter("haiku-4.5", "claude_local")).toBe("claude-haiku-4-5");
    expect(normalizeLightModelForAdapter("sonnet", "claude_local")).toBe("sonnet");
    expect(normalizeLightModelForAdapter("sonnet-5", "codex_local")).toBe("sonnet-5");
  });

  it("switches a Codex agent to Claude Code when the primary model is a Claude model", () => {
    const result = resolveLightAdapterSwitchForRun({
      ...codexAgent,
      agentRuntimeConfig: {
        lightRouting: {
          mode: "fixed",
          primaryModel: "sonnet-5",
          fallbackModels: [{ model: "gpt-5.6-terra" }],
          adapterConfigs: { claude_local: { effort: "high" } },
        },
      },
      contextSnapshot: { task: "review" },
      knownAdapterTypes,
    });
    expect(result.switch).toMatchObject({
      fromAdapterType: "codex_local",
      adapterType: "claude_local",
      model: "claude-sonnet-5",
    });
    expect(result.routing.selectedAdapterSource).toBe("inferred");
    expect(result.switch?.adapterConfig).toEqual({
      env: codexAgent.agentAdapterConfig.env,
      instructionsFilePath: "/agents/cto/AGENTS.md",
      paperclipSkillSync: { desiredSkills: ["local/x/dokploy"] },
      effort: "high",
    });
    expect(result.switch?.adapterConfig).not.toHaveProperty("command");
    expect(result.switch?.adapterConfig).not.toHaveProperty("model");
  });

  it("keeps the agent adapter for its own model and for unknown adapter types", () => {
    const own = resolveLightAdapterSwitchForRun({
      ...codexAgent,
      agentRuntimeConfig: { lightRouting: { primaryModel: "gpt-5.6-sol" } },
      contextSnapshot: {},
      knownAdapterTypes,
    });
    expect(own.switch).toBeNull();
    expect(own.routing.adapterSwitched).toBe(false);

    const adapterDefault = resolveLightAdapterSwitchForRun({
      agentAdapterType: "custom_local",
      agentAdapterConfig: { model: "claude-sonnet-5" },
      agentRuntimeConfig: {},
      contextSnapshot: {},
      knownAdapterTypes: new Set(["custom_local", "claude_local"]),
    });
    expect(adapterDefault.switch).toBeNull();
    expect(adapterDefault.routing.selectedAdapterType).toBe("custom_local");

    const unregistered = resolveLightAdapterSwitchForRun({
      ...codexAgent,
      agentRuntimeConfig: { lightRouting: { primaryModel: "gemini_local:gemini-3" } },
      contextSnapshot: {},
      knownAdapterTypes,
    });
    expect(unregistered.switch).toBeNull();
    expect(unregistered.routing.adapterSwitched).toBe(false);
  });

  it("follows the fallback index across adapters and honours the registry adapter", () => {
    const companyConfig = lightCompanyConfigSchema.parse({
      modelRegistry: [{
        provider: "umans",
        modelId: "umans/umans-deepseek-v4-flash-0731",
        adapterType: "opencode_local",
        displayName: "DeepSeek",
        capabilities: ["code", "tools"],
        supportsTools: true,
      }],
    });
    const agentRuntimeConfig = {
      lightRouting: {
        primaryModel: "gpt-5.6-sol",
        fallbackModels: [
          { model: "claude_local:claude-sonnet-5" },
          { model: "umans/umans-deepseek-v4-flash-0731" },
        ],
      },
    };
    const primary = resolveLightAdapterSwitchForRun({ ...codexAgent, agentRuntimeConfig, companyConfig, contextSnapshot: {}, knownAdapterTypes });
    expect(primary.switch).toBeNull();
    const first = resolveLightAdapterSwitchForRun({ ...codexAgent, agentRuntimeConfig, companyConfig, contextSnapshot: { lightFallbackIndex: 1 }, knownAdapterTypes });
    expect(first.switch).toMatchObject({ adapterType: "claude_local", model: "claude-sonnet-5" });
    expect(first.routing.selectedAdapterSource).toBe("explicit");
    const second = resolveLightAdapterSwitchForRun({ ...codexAgent, agentRuntimeConfig, companyConfig, contextSnapshot: { lightFallbackIndex: 2 }, knownAdapterTypes });
    expect(second.switch).toMatchObject({ adapterType: "opencode_local", model: "umans/umans-deepseek-v4-flash-0731" });
    expect(second.routing.selectedAdapterSource).toBe("registry");
  });

  it("reports when a provider-quota retry moves to another adapter", () => {
    const agentRuntimeConfig = {
      lightRouting: {
        primaryModel: "gpt-5.6-sol",
        fallbackModels: [{ model: "claude-sonnet-5" }, { model: "gpt-5.4" }],
      },
    };
    const first = resolveLightRetryAdapterSwitch({ ...codexAgent, agentRuntimeConfig, contextSnapshot: {}, nextAttempt: 1, knownAdapterTypes });
    expect(first).toEqual({
      fromAdapterType: "codex_local",
      toAdapterType: "claude_local",
      toModel: "claude-sonnet-5",
      lightFallbackIndex: 1,
      switches: true,
    });
    const second = resolveLightRetryAdapterSwitch({
      ...codexAgent,
      agentRuntimeConfig,
      contextSnapshot: { lightFallbackIndex: 1 },
      nextAttempt: 2,
      knownAdapterTypes,
    });
    expect(second).toMatchObject({ fromAdapterType: "claude_local", toAdapterType: "codex_local", switches: true });
    expect(resolveLightRetryAdapterSwitch({
      ...codexAgent,
      agentRuntimeConfig: { lightRouting: { primaryModel: "gpt-5.6-sol", fallbackEnabled: false, fallbackModels: [{ model: "claude-sonnet-5" }] } },
      contextSnapshot: {},
      nextAttempt: 1,
      knownAdapterTypes,
    })).toBeNull();
  });

  it("only carries adapter-agnostic config keys across an adapter switch", () => {
    expect(buildLightAdapterSwitchConfig({
      baseConfig: { command: "/home/paperclip/.opencode/bin/opencode", variant: "x", env: { A: 1 }, cwd: "/repo", timeoutSec: 0 },
      targetAdapterType: "codex_local",
      agentRuntimeConfig: { lightRouting: { adapterConfigs: { codex_local: { command: "codex" } } } },
    })).toEqual({ env: { A: 1 }, cwd: "/repo", timeoutSec: 0, command: "codex" });
  });
});
