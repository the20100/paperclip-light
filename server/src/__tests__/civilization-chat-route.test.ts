import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetExperimental = vi.hoisted(() => vi.fn());
const mockAssertInstanceAdmin = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  boardAuthService: () => ({
    createNamedBoardApiKey: vi.fn(),
    revokeBoardApiKey: vi.fn(),
  }),
  instanceSettingsService: () => ({ getExperimental: mockGetExperimental }),
  issueService: () => ({
    create: vi.fn(),
    addComment: vi.fn(),
    listComments: vi.fn(),
  }),
}));

vi.mock("../routes/authz.js", () => ({
  assertCompanyAccess: vi.fn(),
  assertInstanceAdmin: mockAssertInstanceAdmin,
  getActorInfo: () => ({ actorId: "user-1", agentId: null, runId: null }),
  hasCompanyAccess: () => true,
}));

async function createApp() {
  const { civilizationChatRoutes } = await import("../routes/civilization-chat.js");
  const { errorHandler } = await import("../middleware/error-handler.js");
  const app = express();
  app.use(express.json());
  app.use("/api", civilizationChatRoutes({} as any, { deploymentMode: "local_trusted" }));
  app.use(errorHandler);
  return app;
}

describe("civilization chat model catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes Sol as the default and subscription models to instance admins", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
    const res = await request(await createApp()).get("/api/civilization-chat/models");

    expect(res.status).toBe(200);
    expect(res.body.defaultModel).toBe("gpt-5.6-sol");
    expect(res.body.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "gpt-5.6-sol", provider: "codex", subscription: true }),
      expect.objectContaining({ id: "claude-opus-4-8", provider: "claude", subscription: true }),
    ]));
    expect(mockAssertInstanceAdmin).toHaveBeenCalledOnce();
  });

  it("keeps the endpoint behind the experimental feature flag", async () => {
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: false });
    const res = await request(await createApp()).get("/api/civilization-chat/models");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FEATURE_DISABLED");
    expect(mockAssertInstanceAdmin).not.toHaveBeenCalled();
  });
});

describe("civilization chat transcription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetExperimental.mockResolvedValue({ enableConferenceRoomChat: true });
  });

  it("keeps the OpenAI credential server-side and returns only the transcript", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-transcription-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ text: "Bonjour Architecte" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    try {
      const res = await request(await createApp())
        .post("/api/civilization-chat/transcribe")
        .attach("audio", Buffer.from("audio bytes"), { filename: "dictation.webm", contentType: "audio/webm" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ text: "Bonjour Architecte" });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.openai.com/v1/audio/transcriptions",
        expect.objectContaining({
          method: "POST",
          headers: { Authorization: "Bearer test-transcription-key" },
        }),
      );
    } finally {
      fetchMock.mockRestore();
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });

  it("does not accept non-media uploads", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-transcription-key";
    try {
      const res = await request(await createApp())
        .post("/api/civilization-chat/transcribe")
        .attach("audio", Buffer.from("not audio"), { filename: "notes.txt", contentType: "text/plain" });

      expect(res.status).toBe(422);
      expect(res.body.error).toContain("audio");
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });
});

describe("civilization chat mention context", () => {
  it("passes resolved task identifiers and names to the model without changing the visible message", async () => {
    const { mentionContext } = await import("../routes/civilization-chat.js");

    expect(mentionContext([
      { kind: "task", id: "task-uuid", detail: "PAL213", label: "Corriger les tags" },
    ])).toContain("task: PAL213 · Corriger les tags (Paperclip id: task-uuid)");
  });
});

describe("civilization chat delegation policy", () => {
  it("makes task delegation the default and requires explicit human direction for direct execution", async () => {
    const { loadArchitectPrompt } = await import("../routes/civilization-chat.js");
    const prompt = loadArchitectPrompt();

    expect(prompt).toContain("DELEGATION POLICY — delegation is the default");
    expect(prompt).toContain("create a clearly scoped Paperclip task");
    expect(prompt).toContain("only when the human explicitly and unambiguously instructs you");
  });
});

describe("civilization chat attachment history", () => {
  it("persists attached images as renderable private attachment links", async () => {
    const { attachmentMarkdown } = await import("../routes/civilization-chat.js");

    expect(attachmentMarkdown([
      { id: "attachment-1", originalFilename: "capture[final].png", contentType: "image/png" },
    ])).toBe("![capture\\[final\\].png](/api/attachments/attachment-1/content)");
  });

  it("persists non-image documents as private download links", async () => {
    const { attachmentMarkdown } = await import("../routes/civilization-chat.js");

    expect(attachmentMarkdown([
      { id: "attachment-2", originalFilename: "brief.md", contentType: "text/markdown" },
    ])).toBe("[📎 brief.md](/api/attachments/attachment-2/content?download=1)");
  });
});
