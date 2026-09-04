import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import multer from "multer";
import { and, desc, eq } from "drizzle-orm";
import { companies, issues } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import type { DeploymentMode } from "@paperclipai/shared";
import { HttpError } from "../errors.js";
import { MAX_ATTACHMENT_BYTES } from "../attachment-types.js";
import { boardAuthService, instanceSettingsService, issueService } from "../services/index.js";
import { assertCompanyAccess, assertInstanceAdmin, getActorInfo, hasCompanyAccess } from "./authz.js";

const ARCHITECT_HARNESS_KIND = "civilization_chat";
const ARCHITECT_REPLY_USER_ID = "civilization-architect";
const MAX_CONCURRENT_ARCHITECT_RUNS = 3;
const ARCHITECT_TIMEOUT_MS = 15 * 60_000;
const TRANSCRIPTION_TIMEOUT_MS = 60_000;
const DELEGATION_POLICY = `DELEGATION POLICY — delegation is the default. When a chat request asks for work that an existing Paperclip agent can perform, create a clearly scoped Paperclip task, assign it to the best available agent, and coordinate its progress. Do this even when you could perform the work yourself. Do not implement product changes, operate project infrastructure, edit files, or execute a task directly with your VPS access when it can be delegated. You may inspect the organisation and relevant state read-only to select the right assignee and write a precise task. In your reply, always name and link the created task(s) and assignee(s). You execute work yourself only when the human explicitly and unambiguously instructs you to do it personally (for example: “fais-le toi-même”, “ne délègue pas”, or an equivalent direct instruction). Do not infer that permission from urgency, convenience, lack of detail, or a request to “faire” something. Status questions, synthesis, and cross-company orchestration that cannot reasonably be assigned to an existing agent may be handled directly.`;

const ARCHITECT_MODELS = [
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", provider: "codex", subscription: true },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", provider: "codex", subscription: true },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", provider: "codex", subscription: true },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", provider: "claude", subscription: true },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", provider: "claude", subscription: true },
] as const;

type ArchitectModel = (typeof ARCHITECT_MODELS)[number];

function executionChatState(value: unknown): {
  model: string | null;
  provider: string | null;
  sessionId: string | null;
  runningAt: string | null;
  lastMessageRole: "user" | "assistant" | null;
  archivedAt: string | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { model: null, provider: null, sessionId: null, runningAt: null, lastMessageRole: null, archivedAt: null };
  }
  const chat = (value as Record<string, unknown>).civilizationChat;
  if (!chat || typeof chat !== "object" || Array.isArray(chat)) {
    return { model: null, provider: null, sessionId: null, runningAt: null, lastMessageRole: null, archivedAt: null };
  }
  const record = chat as Record<string, unknown>;
  return {
    model: typeof record.model === "string" ? record.model : null,
    provider: typeof record.provider === "string" ? record.provider : null,
    sessionId: typeof record.sessionId === "string" ? record.sessionId : null,
    runningAt: typeof record.runningAt === "string" ? record.runningAt : null,
    lastMessageRole: record.lastMessageRole === "user" || record.lastMessageRole === "assistant"
      ? record.lastMessageRole : null,
    archivedAt: typeof record.archivedAt === "string" ? record.archivedAt : null,
  };
}

function publicConversation(row: typeof issues.$inferSelect, company?: { name: string; issuePrefix: string }) {
  const runtime = executionChatState(row.executionState);
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: company?.name ?? "Entreprise inconnue",
    companyIssuePrefix: company?.issuePrefix ?? null,
    title: row.title,
    model: runtime.model ?? "gpt-5.6-sol",
    provider: runtime.provider ?? "codex",
    activityStatus: runtime.runningAt ? "working" : runtime.lastMessageRole === "user" ? "request" : "idle",
    lastMessageRole: runtime.lastMessageRole,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function titleFromMessage(message: string) {
  const singleLine = message.replace(/\s+/g, " ").trim();
  if (!singleLine) return "Nouvelle conversation";
  return singleLine.length > 58 ? `${singleLine.slice(0, 57)}…` : singleLine;
}

function requestedAttachmentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim()))].slice(0, 6);
}

function escapeMarkdownLabel(value: string) {
  return value.replace(/([\\\[\]])/g, "\\$1");
}

function isTranscribableMedia(contentType: string) {
  return /^audio\//i.test(contentType) || /^video\/(mp4|webm)$/i.test(contentType);
}

export function attachmentMarkdown(
  attachments: Array<{ id: string; originalFilename: string | null; contentType: string }>,
) {
  return attachments.map((attachment, index) => {
    const name = attachment.originalFilename?.trim() || `attachment-${index + 1}`;
    const contentPath = `/api/attachments/${attachment.id}/content`;
    return attachment.contentType.startsWith("image/")
      ? `![${escapeMarkdownLabel(name)}](${contentPath})`
      : `[📎 ${escapeMarkdownLabel(name)}](${contentPath}?download=1)`;
  }).join("\n");
}

function stripActionSignals(response: string): string {
  return response.replace(/%%ACTIONS%%[\s\S]*?%%\/ACTIONS%%/g, "").trim();
}

function modelById(value: unknown): ArchitectModel | null {
  if (typeof value !== "string") return null;
  return ARCHITECT_MODELS.find((model) => model.id === value) ?? null;
}

export function mentionContext(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const allowedKinds = new Set(["company", "project", "agent", "skill", "task"]);
  const lines = value.slice(0, 25).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const kind = typeof record.kind === "string" ? record.kind : "";
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const detail = typeof record.detail === "string" ? record.detail.trim() : "";
    if (!allowedKinds.has(kind) || !id || !label) return [];
    return [`- ${kind}: ${detail ? `${detail} · ` : ""}${label} (Paperclip id: ${id})`];
  });
  return lines.length > 0 ? `\n\nRESOLVED PAPERCLIP MENTIONS:\n${lines.join("\n")}` : "";
}

export function loadArchitectPrompt() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../../skills/paperclip-board/SKILL.md"),
    path.resolve(here, "../../skills/paperclip-board/SKILL.md"),
  ];
  const boardSkill = candidates
    .map((candidate) => {
      try {
        return fs.readFileSync(candidate, "utf8").replace(/^---[\s\S]*?---\s*\n/, "");
      } catch {
        return null;
      }
    })
    .find(Boolean) ?? "";

  return `You are the Architecte de civilisation, the board operator's omniscient executive interface for this Paperclip instance. You can inspect and operate every company, project, agent, skill and task the authenticated board user can access. You also have full shell access to this VPS. Translate natural-language intent into concrete, verified actions. Use Paperclip's API for control-plane changes, keep company boundaries explicit, report what you changed, and ask before destructive or irreversible actions. Mentions in the user's message are high-priority context, not a limit on what you may inspect.\n\n${DELEGATION_POLICY}\n\nAttached user files are staged locally for this run. Read and use them when they are relevant: text, Markdown and SVG can be inspected directly; for other formats, use the available local tools to extract their content when possible. To attach a file you created or used to this conversation or another Paperclip task card, upload it with: curl -sS -H "Authorization: Bearer $PAPERCLIP_API_KEY" -F "file=@/absolute/path/to/file" "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/issues/TARGET_ISSUE_ID/attachments". To render a relevant image directly in this chat, use Markdown: ![short description](/api/attachments/ATTACHMENT_ID/content). For a non-image document, link it as [📎 document](/api/attachments/ATTACHMENT_ID/content?download=1). Never expose file:// paths, credentials, or arbitrary private files in your answer.\n\n${boardSkill}\n\nCHAT LINK POLICY — this overrides any conflicting link guidance above: PAPERCLIP_API_URL is a private VPS address for API and shell calls only. Never display it, localhost, or a 127.0.0.1 URL in a user-facing chat response. For Paperclip navigation, always emit a relative Markdown link, for example [OFFAAA-8](/OFFAAA/issues/OFFAAA-8). Relative links deliberately resolve on the Paperclip site open in the user's browser.`;
}

function sse(res: import("express").Response, payload: Record<string, unknown>) {
  if (!res.writableEnded && res.writable) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}

function statusForCodexItem(item: Record<string, unknown>) {
  const type = typeof item.type === "string" ? item.type : "";
  if (type === "command_execution") return "Exécution d’une commande sur le VPS…";
  if (type === "mcp_tool_call") return "Pilotage de Paperclip…";
  if (type === "file_change") return "Modification de fichiers…";
  if (type === "web_search") return "Recherche…";
  return "L’Architecte travaille…";
}

export function civilizationChatRoutes(db: Db, opts: { deploymentMode: DeploymentMode }) {
  const router = Router();
  const issueSvc = issueService(db);
  const boardAuth = boardAuthService(db);
  let liveRuns = 0;
  const liveProcesses = new Map<string, ChildProcessWithoutNullStreams>();
  let promptCache: string | null = null;

  async function runTranscriptionUpload(req: import("express").Request, res: import("express").Response) {
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
    });
    await new Promise<void>((resolve, reject) => {
      upload.single("audio")(req, res, (error: unknown) => error ? reject(error) : resolve());
    });
  }

  async function assertEnabled() {
    const experimental = await instanceSettingsService(db).getExperimental();
    if (experimental.enableConferenceRoomChat !== true) {
      throw new HttpError(403, "L’Architecte de civilisation n’est pas activé", {
        code: "FEATURE_DISABLED",
      });
    }
  }

  async function getConversation(id: string) {
    return db.select().from(issues).where(and(eq(issues.id, id), eq(issues.harnessKind, ARCHITECT_HARNESS_KIND)))
      .then((rows) => rows[0] ?? null);
  }

  async function createConversation(companyId: string, userId: string, model: ArchitectModel, title?: string) {
    const created = await issueSvc.create(companyId, {
      title: title?.trim() || "Nouvelle conversation",
      description: "Conversation privée avec l’Architecte de civilisation",
      status: "todo",
      priority: "medium",
      createdByUserId: userId,
      responsibleUserId: userId,
      trustExplicitResponsibleUserId: true,
    });
    const updated = await db.update(issues).set({
      harnessKind: ARCHITECT_HARNESS_KIND,
      hiddenAt: new Date(),
      originKind: ARCHITECT_HARNESS_KIND,
      executionState: {
        civilizationChat: { model: model.id, provider: model.provider, sessionId: null },
      },
      updatedAt: new Date(),
    }).where(eq(issues.id, created.id)).returning().then((rows) => rows[0]!);
    return updated;
  }

  router.get("/civilization-chat/models", async (req, res) => {
    await assertEnabled();
    assertInstanceAdmin(req);
    res.json({ defaultModel: "gpt-5.6-sol", models: ARCHITECT_MODELS });
  });

  router.post("/civilization-chat/transcribe", async (req, res) => {
    await assertEnabled();
    assertInstanceAdmin(req);
    try {
      await runTranscriptionUpload(req, res);
    } catch (error) {
      if (error instanceof multer.MulterError) {
        res.status(error.code === "LIMIT_FILE_SIZE" ? 422 : 400).json({
          error: error.code === "LIMIT_FILE_SIZE" ? "L’enregistrement dépasse la limite de 10 MB" : error.message,
        });
        return;
      }
      throw error;
    }

    const file = (req as import("express").Request & {
      file?: { buffer: Buffer; mimetype: string; originalname: string };
    }).file;
    if (!file || file.buffer.length === 0) {
      res.status(400).json({ error: "Un enregistrement audio est requis" });
      return;
    }
    if (!isTranscribableMedia(file.mimetype)) {
      res.status(422).json({ error: "Le fichier doit être un enregistrement audio ou vidéo compatible" });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({ error: "La transcription vocale n’est pas encore configurée sur cette instance" });
      return;
    }

    const filename = path.basename(file.originalname || "architecte-audio.webm").replace(/[^a-zA-Z0-9._-]/g, "-");
    const form = new FormData();
    form.set("file", new Blob([file.buffer as unknown as BlobPart], { type: file.mimetype || "audio/webm" }), filename);
    form.set("model", "whisper-1");
    form.set("language", "fr");

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
      });
    } catch {
      res.status(502).json({ error: "Le service de transcription est indisponible" });
      return;
    }
    if (!response.ok) {
      res.status(502).json({ error: "La transcription n’a pas pu être effectuée" });
      return;
    }
    const payload = await response.json().catch(() => null) as { text?: unknown } | null;
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (!text) {
      res.status(422).json({ error: "Aucune parole n’a été détectée dans cet enregistrement" });
      return;
    }
    res.json({ text });
  });

  router.get("/companies/:companyId/civilization-chat/conversations", async (req, res) => {
    await assertEnabled();
    assertInstanceAdmin(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rows = await db.select().from(issues).where(and(
      eq(issues.companyId, companyId),
      eq(issues.harnessKind, ARCHITECT_HARNESS_KIND),
    )).orderBy(desc(issues.updatedAt));
    res.json(rows.filter((row) => !executionChatState(row.executionState).archivedAt).map((row) => publicConversation(row)));
  });

  // The architect is an instance-level operator. Conversations remain backed by
  // company-scoped hidden issues, but the board history deliberately spans them.
  router.get("/civilization-chat/conversations", async (req, res) => {
    await assertEnabled();
    assertInstanceAdmin(req);
    const rows = await db.select({ issue: issues, company: companies })
      .from(issues)
      .innerJoin(companies, eq(issues.companyId, companies.id))
      .where(eq(issues.harnessKind, ARCHITECT_HARNESS_KIND))
      .orderBy(desc(issues.updatedAt));
    res.json(rows
      .filter(({ issue }) => !executionChatState(issue.executionState).archivedAt)
      .map(({ issue, company }) => publicConversation(issue, company)));
  });

  router.post("/companies/:companyId/civilization-chat/conversations", async (req, res) => {
    await assertEnabled();
    assertInstanceAdmin(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const model = modelById(req.body?.model) ?? ARCHITECT_MODELS[0];
    const conversation = await createConversation(companyId, actor.actorId, model, req.body?.title);
    res.status(201).json(publicConversation(conversation));
  });

  router.get("/civilization-chat/conversations/:id/messages", async (req, res) => {
    await assertEnabled();
    assertInstanceAdmin(req);
    const conversation = await getConversation(req.params.id as string);
    if (!conversation || !hasCompanyAccess(req, conversation.companyId)) {
      res.status(404).json({ error: "Conversation introuvable" });
      return;
    }
    assertCompanyAccess(req, conversation.companyId);
    const comments = await issueSvc.listComments(conversation.id, { order: "asc" });
    res.json(comments.map((comment) => ({
      id: comment.id,
      role: comment.authorUserId === ARCHITECT_REPLY_USER_ID ? "assistant" : "user",
      body: comment.body,
      createdAt: comment.createdAt,
    })));
  });

  router.delete("/civilization-chat/conversations/:id", async (req, res) => {
    await assertEnabled();
    assertInstanceAdmin(req);
    const conversation = await getConversation(req.params.id as string);
    if (!conversation || !hasCompanyAccess(req, conversation.companyId)) {
      res.status(404).json({ error: "Conversation introuvable" });
      return;
    }
    assertCompanyAccess(req, conversation.companyId);
    const runtime = executionChatState(conversation.executionState);
    if (runtime.runningAt) {
      res.status(409).json({ error: "Impossible d’archiver une conversation en cours" });
      return;
    }
    await db.update(issues).set({
      executionState: { civilizationChat: { ...runtime, archivedAt: new Date().toISOString() } },
      updatedAt: new Date(),
    }).where(eq(issues.id, conversation.id));
    res.status(204).end();
  });

  router.post("/civilization-chat/conversations/:id/cancel", async (req, res) => {
    await assertEnabled();
    assertInstanceAdmin(req);
    const conversation = await getConversation(req.params.id as string);
    if (!conversation || !hasCompanyAccess(req, conversation.companyId)) {
      res.status(404).json({ error: "Conversation introuvable" });
      return;
    }
    assertCompanyAccess(req, conversation.companyId);
    const process = liveProcesses.get(conversation.id);
    if (!process || process.exitCode !== null) {
      res.status(409).json({ error: "Aucune exécution active pour cette conversation" });
      return;
    }
    process.kill("SIGTERM");
    res.status(202).json({ cancelled: true });
  });

  router.post("/civilization-chat/stream", async (req, res) => {
    await assertEnabled();
    assertInstanceAdmin(req);
    const companyId = typeof req.body?.companyId === "string" ? req.body.companyId : "";
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const attachmentIds = requestedAttachmentIds(req.body?.attachmentIds);
    if (!companyId || (!message && attachmentIds.length === 0)) {
      res.status(400).json({ error: "companyId et un message ou un fichier sont requis" });
      return;
    }
    assertCompanyAccess(req, companyId);
    if (liveRuns >= MAX_CONCURRENT_ARCHITECT_RUNS) {
      res.status(429).json({ error: "L’Architecte traite déjà trop de conversations" });
      return;
    }

    const actor = getActorInfo(req);
    const requestedModel = modelById(req.body?.model) ?? ARCHITECT_MODELS[0];
    let conversation = typeof req.body?.conversationId === "string"
      ? await getConversation(req.body.conversationId)
      : null;
    if (conversation && (conversation.companyId !== companyId || !hasCompanyAccess(req, conversation.companyId))) {
      res.status(404).json({ error: "Conversation introuvable" });
      return;
    }
    if (!conversation) {
      conversation = await createConversation(
        companyId,
        actor.actorId,
        requestedModel,
        titleFromMessage(message || "Fichiers joints"),
      );
    }

    const attachments: NonNullable<Awaited<ReturnType<typeof issueSvc.getAttachmentById>>>[] = [];
    for (const attachmentId of attachmentIds) {
      const attachment = await issueSvc.getAttachmentById(attachmentId);
      if (
        !attachment ||
        attachment.issueId !== conversation.id ||
        attachment.companyId !== companyId
      ) {
        res.status(422).json({ error: "Un fichier joint n’appartient pas à cette conversation" });
        return;
      }
      attachments.push(attachment);
    }

    const existingRuntime = executionChatState(conversation.executionState);
    const model = requestedModel;
    const canResume = existingRuntime.provider === model.provider && existingRuntime.model === model.id;
    const resumeSessionId = canResume ? existingRuntime.sessionId : null;

    const attachmentsMarkdown = attachmentMarkdown(attachments);
    const persistedMessage = [message, attachmentsMarkdown].filter(Boolean).join("\n\n");
    const runtimeBeforeRun = executionChatState(conversation.executionState);
    await issueSvc.addComment(conversation.id, persistedMessage, { userId: actor.actorId, runId: actor.runId });
    await db.update(issues).set({
      executionState: { civilizationChat: { ...runtimeBeforeRun, model: requestedModel.id, provider: requestedModel.provider, runningAt: new Date().toISOString(), lastMessageRole: "user", archivedAt: null } },
      updatedAt: new Date(),
    }).where(eq(issues.id, conversation.id));
    if (conversation.title === "Nouvelle conversation") {
      await db.update(issues).set({ title: titleFromMessage(message || "Fichiers joints"), updatedAt: new Date() })
        .where(eq(issues.id, conversation.id));
    }

    const port = req.socket.localPort ?? 3100;
    const apiUrl = `http://127.0.0.1:${port}`;
    let ephemeralKey: { id: string; token: string } | null = null;
    if (opts.deploymentMode !== "local_trusted") {
      const createdKey = await boardAuth.createNamedBoardApiKey({
        userId: actor.actorId,
        name: `Architecte de civilisation · ${conversation.id.slice(0, 8)}`,
        expiresAt: new Date(Date.now() + ARCHITECT_TIMEOUT_MS + 60_000),
      });
      ephemeralKey = { id: createdKey.id, token: createdKey.token };
    }

    let attachmentTempDir: string | null = null;
    const localAttachments: Array<{ id: string; filename: string; contentType: string; path: string }> = [];
    try {
      if (attachments.length > 0) {
        attachmentTempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "paperclip-architect-attachments-"));
        for (const [index, attachment] of attachments.entries()) {
          const response = await fetch(`${apiUrl}/api/attachments/${attachment.id}/content`, {
            headers: ephemeralKey ? { Authorization: `Bearer ${ephemeralKey.token}` } : undefined,
            signal: AbortSignal.timeout(30_000),
          });
          if (!response.ok) throw new Error(`image download failed (${response.status})`);
          const rawExtension = path.extname(attachment.originalFilename ?? "").toLowerCase();
          const extension = /^\.[a-z0-9]{1,16}$/.test(rawExtension) ? rawExtension : ".bin";
          const localPath = path.join(attachmentTempDir, `${index + 1}-${attachment.id}${extension}`);
          await fs.promises.writeFile(localPath, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
          localAttachments.push({
            id: attachment.id,
            filename: attachment.originalFilename?.trim() || `attachment-${index + 1}`,
            contentType: attachment.contentType,
            path: localPath,
          });
        }
      }
    } catch (error) {
      if (attachmentTempDir) await fs.promises.rm(attachmentTempDir, { recursive: true, force: true }).catch(() => null);
      if (ephemeralKey) await boardAuth.revokeBoardApiKey(ephemeralKey.id).catch(() => null);
      throw new HttpError(500, `Impossible de préparer les fichiers: ${(error as Error).message}`);
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    sse(res, { type: "start", conversationId: conversation.id, model: model.id });

    promptCache ??= loadArchitectPrompt();
    const attachmentContext = localAttachments.length > 0
      ? `\n\nATTACHED FILES (inspect each relevant file before answering):\n${localAttachments.map((attachment) => `- ${attachment.path} (${attachment.contentType}; original name: ${attachment.filename}; chat attachment id: ${attachment.id})`).join("\n")}`
      : "";
    const contextualMessage = `${message || "Analyse les fichiers joints."}${mentionContext(req.body?.mentions)}${attachmentContext}\n\n${DELEGATION_POLICY}`;
    const codexPrompt = resumeSessionId
      ? contextualMessage
      : `${promptCache}\n\nThe active company id is ${companyId}. Begin by understanding the relevant Paperclip state.\n\nUSER MESSAGE:\n${contextualMessage}`;
    const claudePrompt = resumeSessionId
      ? contextualMessage
      : `The active company id is ${companyId}. Begin by understanding the relevant Paperclip state.\n\nUSER MESSAGE:\n${contextualMessage}`;
    const cwd = process.env.PAPERCLIP_ARCHITECT_CWD?.trim() || process.cwd();
    let proc: ChildProcessWithoutNullStreams;
    if (model.provider === "codex") {
      const args = [
        "exec", "--json", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox",
        "--model", model.id, "-c", 'model_reasoning_effort="xhigh"',
      ];
      for (const attachment of localAttachments) {
        if (/^image\/(png|jpeg|webp|gif)$/i.test(attachment.contentType)) args.push("--image", attachment.path);
      }
      if (resumeSessionId) args.push("resume", resumeSessionId, "-");
      else args.push("-");
      proc = spawn(process.env.PAPERCLIP_ARCHITECT_CODEX_COMMAND?.trim() || "codex", args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PAPERCLIP_API_URL: apiUrl,
          PAPERCLIP_COMPANY_ID: companyId,
          PAPERCLIP_CONVERSATION_ID: conversation.id,
          ...(ephemeralKey ? { PAPERCLIP_API_KEY: ephemeralKey.token } : {}),
        },
      });
    } else {
      const args = [
        "-p", "--output-format", "stream-json", "--include-partial-messages", "--verbose",
        "--append-system-prompt", promptCache, "--model", model.id, "--dangerously-skip-permissions",
      ];
      if (resumeSessionId) args.push("--resume", resumeSessionId);
      proc = spawn(process.env.PAPERCLIP_ARCHITECT_CLAUDE_COMMAND?.trim() || "claude", args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PAPERCLIP_API_URL: apiUrl,
          PAPERCLIP_COMPANY_ID: companyId,
          PAPERCLIP_CONVERSATION_ID: conversation.id,
          ...(ephemeralKey ? { PAPERCLIP_API_KEY: ephemeralKey.token } : {}),
        },
      });
    }

    liveRuns += 1;
    liveProcesses.set(conversation.id, proc);
    let released = false;
    let timedOut = false;
    let fullResponse = "";
    let sessionId: string | null = resumeSessionId;
    let stdoutBuffer = "";
    let streamedClaudeDelta = false;
    const release = async () => {
      if (released) return;
      released = true;
      liveRuns -= 1;
      if (liveProcesses.get(conversation!.id) === proc) liveProcesses.delete(conversation!.id);
      if (ephemeralKey) await boardAuth.revokeBoardApiKey(ephemeralKey.id).catch(() => null);
      if (attachmentTempDir) await fs.promises.rm(attachmentTempDir, { recursive: true, force: true }).catch(() => null);
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, ARCHITECT_TIMEOUT_MS);

    // The SSE connection is only a view of the run. A user can safely switch
    // conversations, close the panel, or briefly lose the network without
    // cancelling the Architect's work. Explicit cancellation uses the route
    // above, which owns the process lifecycle.

    proc.stdout.on("data", (data: Buffer) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        if (!rawLine.trim()) continue;
        let event: Record<string, any>;
        try { event = JSON.parse(rawLine); } catch { continue; }

        if (model.provider === "codex") {
          if (event.type === "thread.started" && typeof event.thread_id === "string") {
            sessionId = event.thread_id;
          } else if (event.type === "item.started" && event.item && typeof event.item === "object") {
            sse(res, { type: "status", text: statusForCodexItem(event.item) });
          } else if (event.type === "item.completed" && event.item?.type === "agent_message") {
            const text = typeof event.item.text === "string" ? event.item.text : "";
            if (text) {
              fullResponse += text;
              sse(res, { type: "chunk", text });
            }
          } else if (event.type === "turn.failed") {
            sse(res, { type: "error", message: event.error?.message ?? "Le modèle Codex a échoué" });
          }
          continue;
        }

        if (event.type === "system" && event.subtype === "init" && typeof event.session_id === "string") {
          sessionId = event.session_id;
        }
        const inner = event.type === "stream_event" ? event.event : event;
        if (inner?.type === "content_block_delta" && inner.delta?.text) {
          streamedClaudeDelta = true;
          fullResponse += inner.delta.text;
          sse(res, { type: "chunk", text: inner.delta.text });
        } else if (inner?.type === "content_block_start" && inner.content_block?.type === "tool_use") {
          sse(res, { type: "status", text: `Utilisation de ${inner.content_block.name ?? "l’outil"}…` });
        } else if (!streamedClaudeDelta && event.type === "assistant" && Array.isArray(event.message?.content)) {
          for (const block of event.message.content) {
            if (block.type === "text" && block.text) {
              fullResponse += block.text;
              sse(res, { type: "chunk", text: block.text });
            }
          }
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line) console.error("[civilization-chat]", line);
    });

    proc.on("error", async (error) => {
      clearTimeout(timeout);
      await release();
      sse(res, { type: "error", message: `Impossible de démarrer ${model.provider}: ${error.message}` });
      if (!res.writableEnded) res.end();
    });

    proc.on("close", async (exitCode) => {
      clearTimeout(timeout);
      await release();
      const cleaned = stripActionSignals(fullResponse);
      if (cleaned) {
        await issueSvc.addComment(conversation!.id, cleaned, { userId: ARCHITECT_REPLY_USER_ID }).catch(() => null);
      }
      await db.update(issues).set({
        executionState: {
          civilizationChat: { model: model.id, provider: model.provider, sessionId, runningAt: null, lastMessageRole: cleaned ? "assistant" : "user", archivedAt: null },
        },
        updatedAt: new Date(),
      }).where(eq(issues.id, conversation!.id)).catch(() => null);
      sse(res, {
        type: "done",
        conversationId: conversation!.id,
        exitCode: exitCode ?? -1,
        timedOut,
      });
      if (!res.writableEnded) res.end();
    });

    proc.stdin.end(model.provider === "codex" ? codexPrompt : claudePrompt);
  });

  return router;
}
