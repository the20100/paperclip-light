import fs from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import type { PaperclipApiClient } from "../../client/http.js";
import {
  addIssueCommentSchema,
  captureTaskCheckpointSchema,
  createHumanActionSchema,
  createIssueSchema,
  projectMemoryCreateSchema,
  releaseProjectFilesSchema,
  renewProjectFilesSchema,
  repositoryOperationSchema,
  reserveProjectFilesSchema,
  restoreTaskCheckpointSchema,
  taskReviewDecisionSchema,
  taskReviewRequestSchema,
  updateIssueSchema,
  type FileReservation,
  type FileReservationResult,
  type Issue,
  type IssueComment,
  type HumanAction,
  type ProjectMemoryItem,
  type RepositoryOperation,
  type TaskCheckpoint,
  type TaskReview,
} from "@paperclipai/shared";
import {
  addCommonClientOptions,
  apiPath,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";

type TaskCreateOptions = BaseClientOptions & {
  projectId?: string;
  assign?: string;
  parent?: string;
  description?: string;
};

type TaskMutationOptions = BaseClientOptions & { summary?: string };
type FilesOptions = BaseClientOptions & { leaseSeconds?: string; force?: boolean };
type RepoOptions = BaseClientOptions & { message?: string };
type ReviewOptions = BaseClientOptions & { summary?: string; reviewer?: string; changes?: string };
type CheckpointOptions = BaseClientOptions & { summary?: string };
type MemoryOptions = BaseClientOptions & { importance?: string };
type ActionOptions = BaseClientOptions & { summary?: string; key?: string; task?: string; project?: string };

function integerOption(value: string | undefined) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`Expected an integer, received: ${value}`);
  return parsed;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveTaskUuid(api: PaperclipApiClient, taskRef: string) {
  if (isUuid(taskRef)) return taskRef;
  const task = await api.get<Issue>(apiPath`/api/issues/${taskRef}`);
  if (!task?.id) throw new Error(`Paperclip could not resolve task ${taskRef}`);
  return task.id;
}

export function registerLightCommands(program: Command): void {
  const task = program.command("task").description("Minimal task commands for autonomous agents");

  addCommonClientOptions(
    task
      .command("show")
      .argument("<task>", "Task UUID or identifier")
      .description("Read one task")
      .action(async (taskRef: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get<Issue>(apiPath`/api/issues/${taskRef}`), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );

  addCommonClientOptions(
    task
      .command("create")
      .argument("<title>", "Task title")
      .description("Create and optionally assign a task")
      .requiredOption("-C, --company-id <id>", "Company ID")
      .option("-P, --project-id <id>", "Project ID")
      .option("-a, --assign <agentId>", "Agent ID")
      .option("-p, --parent <taskId>", "Parent task ID")
      .option("-D, --description <text>", "Task description")
      .action(async (title: string, opts: TaskCreateOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const payload = createIssueSchema.parse({
            title,
            description: opts.description,
            projectId: opts.projectId,
            assigneeAgentId: opts.assign,
            parentId: opts.parent,
            status: opts.assign ? "todo" : "backlog",
          });
          printOutput(await ctx.api.post<Issue>(apiPath`/api/companies/${ctx.companyId}/issues`, payload), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    task
      .command("assign")
      .argument("<task>", "Task UUID or identifier")
      .argument("<agentId>", "Agent ID")
      .description("Assign a task")
      .action(async (taskRef: string, agentId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = updateIssueSchema.parse({ assigneeAgentId: agentId, status: "todo" });
          printOutput(await ctx.api.patch<Issue>(apiPath`/api/issues/${taskRef}`, payload), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );

  addCommonClientOptions(
    task
      .command("comment")
      .argument("<task>", "Task UUID or identifier")
      .argument("<message>", "Comment text")
      .description("Comment on a task")
      .action(async (taskRef: string, message: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = addIssueCommentSchema.parse({ body: message });
          printOutput(await ctx.api.post<IssueComment>(apiPath`/api/issues/${taskRef}/comments`, payload), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );

  addCommonClientOptions(
    task
      .command("attach")
      .argument("<task>", "Task UUID or identifier")
      .argument("<file>", "Local file to attach")
      .description("Attach a deliverable file to a task")
      .action(async (taskRef: string, file: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const filePath = path.resolve(file);
          const bytes = await fs.readFile(filePath);
          if (bytes.length === 0) throw new Error("Attachment is empty");
          const filename = path.basename(filePath);
          const contentType = inferLightAttachmentContentType(filename);
          const form = new FormData();
          form.append("file", new Blob([bytes], { type: contentType }), filename);
          printOutput(
            await ctx.api.postForm(
              apiPath`/api/companies/${ctx.companyId}/issues/${taskRef}/attachments`,
              form,
            ),
            { json: ctx.json },
          );
        } catch (error) { handleCommandError(error); }
      }),
    { includeCompany: true },
  );

  addCommonClientOptions(
    task
      .command("submit")
      .argument("<task>", "Task UUID or identifier")
      .description("Submit completed work to the manager for review")
      .requiredOption("-s, --summary <text>", "Concise completion summary")
      .action(async (taskRef: string, opts: TaskMutationOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = taskReviewRequestSchema.parse({ summary: opts.summary, sourceRunId: opts.runId });
          printOutput(await ctx.api.post<TaskReview>(apiPath`/api/issues/${taskRef}/light/reviews`, payload), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );

  addCommonClientOptions(
    task
      .command("done")
      .argument("<task>", "Task UUID or identifier")
      .description("Approve and close a reviewed task")
      .requiredOption("-s, --summary <text>", "Concise final summary")
      .action(async (taskRef: string, opts: TaskMutationOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = updateIssueSchema.parse({ status: "done", comment: opts.summary });
          printOutput(await ctx.api.patch<Issue>(apiPath`/api/issues/${taskRef}`, payload), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );

  const review = program.command("review").description("Structured manager review commands");
  addCommonClientOptions(
    review.command("list").argument("<task>", "Task UUID or identifier").description("List review cycles")
      .action(async (taskRef: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          printOutput(await ctx.api.get<TaskReview[]>(apiPath`/api/issues/${taskRef}/light/reviews`), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );
  addCommonClientOptions(
    review.command("request").argument("<task>", "Task UUID or identifier")
      .requiredOption("-s, --summary <text>", "Concise completion summary")
      .option("--reviewer <agentId>", "Explicit reviewer; defaults to the manager")
      .description("Request a manager review")
      .action(async (taskRef: string, opts: ReviewOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = taskReviewRequestSchema.parse({ reviewerAgentId: opts.reviewer, summary: opts.summary, sourceRunId: opts.runId });
          printOutput(await ctx.api.post<TaskReview>(apiPath`/api/issues/${taskRef}/light/reviews`, payload), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );
  addCommonClientOptions(
    review.command("decide").argument("<task>", "Task UUID or identifier").argument("<reviewId>", "Review UUID")
      .argument("<decision>", "accepted, changes_requested, blocked, or cancelled")
      .requiredOption("-s, --summary <text>", "Decision reason")
      .option("--changes <items>", "Pipe-separated required changes")
      .description("Accept work or request precise changes")
      .action(async (taskRef: string, reviewId: string, decision: string, opts: ReviewOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = taskReviewDecisionSchema.parse({
            decision,
            summary: opts.summary,
            requiredChanges: opts.changes?.split("|").map((value) => value.trim()).filter(Boolean) ?? [],
            decidedRunId: opts.runId,
          });
          printOutput(await ctx.api.post<TaskReview>(apiPath`/api/issues/${taskRef}/light/reviews/${reviewId}/decision`, payload), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );

  const checkpoint = program.command("checkpoint").description("Save and restore reserved-file task state");
  addCommonClientOptions(
    checkpoint.command("list").argument("<projectId>").argument("[taskId]")
      .action(async (projectId: string, taskId: string | undefined, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const resolvedTaskId = taskId ? await resolveTaskUuid(ctx.api, taskId) : undefined;
          const query = resolvedTaskId ? `?${new URLSearchParams({ issueId: resolvedTaskId })}` : "";
          printOutput(await ctx.api.get<TaskCheckpoint[]>(`${apiPath`/api/projects/${projectId}/light/checkpoints`}${query}`), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );
  addCommonClientOptions(
    checkpoint.command("save").argument("<projectId>").argument("<taskId>").argument("<paths...>")
      .option("-s, --summary <text>", "Checkpoint state")
      .action(async (projectId: string, taskId: string, paths: string[], opts: CheckpointOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const resolvedTaskId = await resolveTaskUuid(ctx.api, taskId);
          const payload = captureTaskCheckpointSchema.parse({ paths, summary: opts.summary, runId: opts.runId });
          printOutput(await ctx.api.post<TaskCheckpoint>(apiPath`/api/projects/${projectId}/light/checkpoints/${resolvedTaskId}`, payload), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );
  addCommonClientOptions(
    checkpoint.command("restore").argument("<projectId>").argument("<taskId>").argument("<checkpointId>")
      .action(async (projectId: string, taskId: string, checkpointId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const resolvedTaskId = await resolveTaskUuid(ctx.api, taskId);
          const payload = restoreTaskCheckpointSchema.parse({ runId: opts.runId });
          printOutput(await ctx.api.post<TaskCheckpoint>(apiPath`/api/projects/${projectId}/light/checkpoints/${resolvedTaskId}/${checkpointId}/restore`, payload), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );

  const memory = program.command("memory").description("Compact persistent project memory");
  addCommonClientOptions(
    memory.command("list").argument("<projectId>").action(async (projectId: string, opts: BaseClientOptions) => {
      try {
        const ctx = resolveCommandContext(opts);
        printOutput(await ctx.api.get<ProjectMemoryItem[]>(apiPath`/api/projects/${projectId}/light/memory`), { json: ctx.json });
      } catch (error) { handleCommandError(error); }
    }),
  );
  addCommonClientOptions(
    memory.command("add").argument("<projectId>").argument("<category>").argument("<text>")
      .option("--importance <n>", "0-100 importance")
      .action(async (projectId: string, category: string, text: string, opts: MemoryOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = projectMemoryCreateSchema.parse({
            category, text,
            importance: opts.importance === undefined ? undefined : integerOption(opts.importance),
            sourceIssueId: process.env.PAPERCLIP_TASK_ID,
            sourceRunId: opts.runId,
          });
          printOutput(await ctx.api.post<ProjectMemoryItem>(apiPath`/api/projects/${projectId}/light/memory`, payload), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );

  const action = program.command("action").description("Human-gated external effects");
  addCommonClientOptions(
    action.command("request").argument("<kind>", "email, payment, publication, deployment, deletion, account_creation, secret_change, or other")
      .requiredOption("-s, --summary <text>", "Exact human-readable action")
      .requiredOption("-k, --key <key>", "Stable idempotency key")
      .option("--task <taskId>", "Related task")
      .option("--project <projectId>", "Related project")
      .description("Request approval once, then stop until a human decides")
      .action(async (kind: string, opts: ActionOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const payload = createHumanActionSchema.parse({
            actionKind: kind,
            summary: opts.summary,
            idempotencyKey: opts.key,
            issueId: opts.task ? await resolveTaskUuid(ctx.api, opts.task) : undefined,
            projectId: opts.project,
            requestingRunId: opts.runId,
          });
          printOutput(await ctx.api.post<HumanAction>(apiPath`/api/companies/${ctx.companyId}/light/actions`, payload), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
    { includeCompany: true },
  );

  const files = program.command("files").description("Reserve shared-checkout files before writing");

  addCommonClientOptions(
    files
      .command("reserve")
      .argument("<projectId>", "Project UUID")
      .argument("<taskId>", "Task UUID")
      .argument("<paths...>", "Repository-relative file paths")
      .option("--lease-seconds <n>", "Reservation lease duration")
      .description("Atomically reserve all paths, or pause and wait")
      .action(async (projectId: string, taskId: string, paths: string[], opts: FilesOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const resolvedTaskId = await resolveTaskUuid(ctx.api, taskId);
          const payload = reserveProjectFilesSchema.parse({
            issueId: resolvedTaskId,
            paths,
            runId: opts.runId,
            leaseSeconds: integerOption(opts.leaseSeconds),
          });
          printOutput(
            await ctx.api.post<FileReservationResult>(apiPath`/api/projects/${projectId}/file-reservations/reserve`, payload),
            { json: ctx.json },
          );
        } catch (error) { handleCommandError(error); }
      }),
  );

  addCommonClientOptions(
    files
      .command("status")
      .argument("<projectId>", "Project UUID")
      .argument("[taskId]", "Optional task UUID")
      .description("List file reservations")
      .action(async (projectId: string, taskId: string | undefined, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const resolvedTaskId = taskId ? await resolveTaskUuid(ctx.api, taskId) : undefined;
          const query = resolvedTaskId ? `?${new URLSearchParams({ issueId: resolvedTaskId })}` : "";
          printOutput(await ctx.api.get<FileReservation[]>(`${apiPath`/api/projects/${projectId}/file-reservations`}${query}`), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );

  addCommonClientOptions(
    files
      .command("renew")
      .argument("<projectId>", "Project UUID")
      .argument("<taskId>", "Task UUID")
      .option("--lease-seconds <n>", "Reservation lease duration")
      .description("Renew active reservations without waking an agent")
      .action(async (projectId: string, taskId: string, opts: FilesOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const resolvedTaskId = await resolveTaskUuid(ctx.api, taskId);
          const payload = renewProjectFilesSchema.parse({
            issueId: resolvedTaskId,
            runId: opts.runId,
            leaseSeconds: integerOption(opts.leaseSeconds),
          });
          printOutput(await ctx.api.post<FileReservation[]>(apiPath`/api/projects/${projectId}/file-reservations/renew`, payload), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );

  addCommonClientOptions(
    files
      .command("release")
      .argument("<projectId>", "Project UUID")
      .argument("<taskId>", "Task UUID")
      .argument("[paths...]", "Specific paths; omit to release all")
      .option("--force", "Human-only force release")
      .description("Release reservations and resume the next compatible waiter")
      .action(async (projectId: string, taskId: string, paths: string[], opts: FilesOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const resolvedTaskId = await resolveTaskUuid(ctx.api, taskId);
          const payload = releaseProjectFilesSchema.parse({
            issueId: resolvedTaskId,
            paths: paths.length > 0 ? paths : undefined,
            runId: opts.runId,
            force: opts.force,
          });
          printOutput(await ctx.api.post(apiPath`/api/projects/${projectId}/file-reservations/release`, payload), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );

  const repo = program.command("repo").description("Serialized shared-checkout Git operations");
  for (const kind of ["status", "diff", "validate"] as const) {
    addCommonClientOptions(
      repo
        .command(kind)
        .argument("<projectId>", "Project UUID")
        .argument("<taskId>", "Task UUID")
        .argument("[paths...]", "Optional reserved paths")
        .description(`${kind} through the repository broker`)
        .action(async (projectId: string, taskId: string, paths: string[], opts: RepoOptions) => {
          try {
            const ctx = resolveCommandContext(opts);
            const resolvedTaskId = await resolveTaskUuid(ctx.api, taskId);
            const payload = repositoryOperationSchema.parse({
              issueId: resolvedTaskId,
              kind,
              paths: paths.length > 0 ? paths : undefined,
              runId: opts.runId,
            });
            const operation = await ctx.api.post<RepositoryOperation>(apiPath`/api/projects/${projectId}/repository/operations`, payload);
            printOutput(ctx.json ? operation : operation?.stdoutExcerpt ?? operation, { json: ctx.json });
          } catch (error) { handleCommandError(error); }
        }),
    );
  }

  addCommonClientOptions(
    repo
      .command("commit")
      .argument("<projectId>", "Project UUID")
      .argument("<taskId>", "Task UUID")
      .argument("[paths...]", "Reserved paths; omit to use all changed reserved paths")
      .requiredOption("-m, --message <text>", "Commit message")
      .description("Commit only task-owned paths using an isolated Git index")
      .action(async (projectId: string, taskId: string, paths: string[], opts: RepoOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const resolvedTaskId = await resolveTaskUuid(ctx.api, taskId);
          const payload = repositoryOperationSchema.parse({
            issueId: resolvedTaskId,
            kind: "commit",
            paths: paths.length > 0 ? paths : undefined,
            message: opts.message,
            runId: opts.runId,
          });
          printOutput(await ctx.api.post<RepositoryOperation>(apiPath`/api/projects/${projectId}/repository/operations`, payload), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );

  addCommonClientOptions(
    repo
      .command("push")
      .argument("<projectId>", "Project UUID")
      .argument("<taskId>", "Task UUID")
      .argument("<branch>", "Allowed target branch")
      .description("Push HEAD to an allowed branch without switching branches")
      .action(async (projectId: string, taskId: string, branch: string, opts: RepoOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const resolvedTaskId = await resolveTaskUuid(ctx.api, taskId);
          const payload = repositoryOperationSchema.parse({
            issueId: resolvedTaskId,
            kind: "push",
            targetBranch: branch,
            runId: opts.runId,
          });
          printOutput(await ctx.api.post<RepositoryOperation>(apiPath`/api/projects/${projectId}/repository/operations`, payload), { json: ctx.json });
        } catch (error) { handleCommandError(error); }
      }),
  );
}

function inferLightAttachmentContentType(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  return {
    ".csv": "text/csv",
    ".gif": "image/gif",
    ".html": "text/html",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".json": "application/json",
    ".md": "text/markdown",
    ".mov": "video/quicktime",
    ".mp4": "video/mp4",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain",
    ".webm": "video/webm",
    ".webp": "image/webp",
    ".zip": "application/zip",
  }[extension] ?? "application/octet-stream";
}
