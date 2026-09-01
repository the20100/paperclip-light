#!/usr/bin/env node

// Dependency-free runtime CLI for Paperclip Light. The heartbeat harness copies
// this file into a private run scratch directory and prepends it to PATH as `pc`.
// Authentication remains exclusively in the injected PAPERCLIP_* environment.

import fs from "node:fs/promises";
import path from "node:path";

const MIME_BY_EXTENSION = {
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
};

const HELP = `Paperclip Light CLI

Task:
  pc task list [--mine] [-P PROJECT]
  pc task show TASK [--full]
  pc task create TITLE [-C COMPANY] [-P PROJECT] [-a AGENT] [-p PARENT] [-D DESCRIPTION]
  pc task assign TASK AGENT
  pc task comment TASK MESSAGE
  pc task mention TASK AGENT MESSAGE
  pc task pause|fail|cancel TASK -s REASON
  pc task block TASK -s REASON [--depends-on TASK|TASK] [--owner AGENT|board]
  pc task depend TASK BLOCKER...
  pc task run TASK [--fresh]
  pc task attach TASK FILE
  pc task submit TASK -s SUMMARY
  pc task done TASK -s SUMMARY

Agents, skills and secrets:
  pc agent list
  pc agent show AGENT
  pc skill list
  pc secret list

Review and approvals:
  pc review list TASK
  pc review request TASK -s SUMMARY [--reviewer AGENT]
  pc review decide TASK REVIEW accepted|changes_requested|blocked|cancelled -s SUMMARY [--changes "A|B"]
  pc action request COMPANY KIND -s SUMMARY -k IDEMPOTENCY_KEY [--task TASK] [--project PROJECT] [--target-branch BRANCH]

Memory and checkpoints:
  pc memory list PROJECT
  pc memory add PROJECT CATEGORY TEXT [--importance N]
  pc checkpoint list PROJECT [TASK]
  pc checkpoint save PROJECT TASK PATH... [-s SUMMARY]
  pc checkpoint restore PROJECT TASK CHECKPOINT
  pc checkpoint discard PROJECT TASK CHECKPOINT

Shared files:
  pc files reserve PROJECT TASK PATH...
  pc files status PROJECT [TASK]
  pc files renew PROJECT TASK [--lease-seconds N]
  pc files release PROJECT TASK [PATH...]

Repository broker:
  pc repo status|diff|validate|fetch|sync PROJECT TASK [PATH...]
  pc repo commit PROJECT TASK -m MESSAGE [PATH...]
  pc repo merge PROJECT TASK BRANCH
  pc repo push PROJECT TASK BRANCH [--approval ACTION_ID]`;

function fail(message, exitCode = 1) {
  process.stderr.write(`pc: ${message}\n`);
  process.exit(exitCode);
}

function required(value, label) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) fail(`${label} is required`);
  return text;
}

function takeOption(args, names) {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index < 0) continue;
    const value = args[index + 1];
    if (!value || value.startsWith("-")) fail(`${name} requires a value`);
    args.splice(index, 2);
    return value;
  }
  return undefined;
}

function takeFlag(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function positiveInteger(value, label) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${label} must be a positive integer`);
  return parsed;
}

function apiBase() {
  return required(process.env.PAPERCLIP_API_URL, "PAPERCLIP_API_URL")
    .replace(/\/+$/, "")
    .replace(/\/api$/, "");
}

function apiUrl(route) {
  return `${apiBase()}${route.startsWith("/") ? route : `/${route}`}`;
}

function segment(value) {
  return encodeURIComponent(required(value, "path segment"));
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function request(method, route, body) {
  const headers = { accept: "application/json" };
  const apiKey = required(process.env.PAPERCLIP_API_KEY, "PAPERCLIP_API_KEY");
  headers.authorization = `Bearer ${apiKey}`;
  if (process.env.PAPERCLIP_RUN_ID) headers["x-paperclip-run-id"] = process.env.PAPERCLIP_RUN_ID;

  let requestBody;
  if (body instanceof FormData) {
    requestBody = body;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(apiUrl(route), { method, headers, body: requestBody });
  } catch (error) {
    fail(`cannot reach Paperclip: ${error instanceof Error ? error.message : String(error)}`);
  }
  const text = await response.text();
  let payload = null;
  if (text.trim()) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (!response.ok) {
    const message = payload && typeof payload === "object"
      ? payload.error ?? payload.message ?? JSON.stringify(payload)
      : payload || `HTTP ${response.status}`;
    fail(`${method} ${route} failed (${response.status}): ${message}`);
  }
  return payload;
}

async function resolveTaskId(taskRef) {
  const ref = required(taskRef, "task id");
  if (isUuid(ref)) return ref;
  const task = await request("GET", `/api/issues/${segment(ref)}`);
  return required(task?.id, `resolved task id for ${ref}`);
}

function payloadRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of ["items", "rows", "issues", "agents", "projects", "skills"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function normalizedRef(value) {
  return required(value, "reference").normalize("NFKC").trim().toLocaleLowerCase("en");
}

async function resolveAgent(agentRef) {
  const ref = required(agentRef, "agent");
  if (isUuid(ref)) return request("GET", `/api/agents/${segment(ref)}`);
  const companyId = required(process.env.PAPERCLIP_COMPANY_ID, "PAPERCLIP_COMPANY_ID");
  const rows = payloadRows(await request("GET", `/api/companies/${segment(companyId)}/agents`));
  const key = normalizedRef(ref);
  const matches = rows.filter((agent) => [agent.id, agent.name, agent.title, agent.slug]
    .some((value) => typeof value === "string" && normalizedRef(value) === key));
  if (matches.length !== 1) fail(matches.length === 0 ? `agent not found: ${ref}` : `agent is ambiguous: ${ref}`);
  return matches[0];
}

async function resolveProjectId(projectRef) {
  const ref = required(projectRef, "project");
  if (isUuid(ref) || ref === process.env.PAPERCLIP_PROJECT_ID) return ref;
  const companyId = required(process.env.PAPERCLIP_COMPANY_ID, "PAPERCLIP_COMPANY_ID");
  const rows = payloadRows(await request("GET", `/api/companies/${segment(companyId)}/projects`));
  const key = normalizedRef(ref);
  const matches = rows.filter((project) => [project.id, project.name, project.slug]
    .some((value) => typeof value === "string" && normalizedRef(value) === key));
  if (matches.length !== 1) fail(matches.length === 0 ? `project not found: ${ref}` : `project is ambiguous: ${ref}`);
  return required(matches[0]?.id, `resolved project id for ${ref}`);
}

function print(payload) {
  if (payload === null || payload === undefined) return;
  process.stdout.write(`${typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)}\n`);
}

function compactTask(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const keys = [
    "id",
    "identifier",
    "title",
    "description",
    "status",
    "projectId",
    "parentId",
    "assigneeAgentId",
    "workMode",
    "reviewPolicy",
    "failureReason",
    "pauseReason",
  ];
  return Object.fromEntries(keys.filter((key) => payload[key] !== undefined).map((key) => [key, payload[key]]));
}

function compactComment(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return {
    id: payload.id,
    issueId: payload.issueId,
    body: payload.body,
    createdAt: payload.createdAt,
  };
}

function compactAttachment(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return {
    id: payload.id,
    filename: payload.originalFilename,
    contentType: payload.contentType,
    byteSize: payload.byteSize,
    contentPath: payload.contentPath,
  };
}

async function taskCommand(action, args) {
  if (action === "list") {
    const mine = takeFlag(args, "--mine");
    const projectRef = takeOption(args, ["-P", "--project"]);
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    if (mine) return request("GET", "/api/agents/me/inbox-lite");
    const companyId = required(process.env.PAPERCLIP_COMPANY_ID, "PAPERCLIP_COMPANY_ID");
    const query = projectRef ? `?projectId=${segment(await resolveProjectId(projectRef))}` : "";
    return request("GET", `/api/companies/${segment(companyId)}/issues${query}`);
  }
  if (action === "show") {
    const full = takeFlag(args, "--full");
    const taskId = required(args.shift(), "task id");
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    const result = await request("GET", `/api/issues/${segment(taskId)}`);
    return full ? result : compactTask(result);
  }
  if (action === "create") {
    const title = required(args.shift(), "title");
    const companyId = takeOption(args, ["-C", "--company-id"]) ?? process.env.PAPERCLIP_COMPANY_ID;
    const projectRef = takeOption(args, ["-P", "--project-id"]) ?? process.env.PAPERCLIP_PROJECT_ID;
    const assigneeRef = takeOption(args, ["-a", "--assign"]);
    const parentId = takeOption(args, ["-p", "--parent"]);
    const description = takeOption(args, ["-D", "--description"]);
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    return compactTask(await request("POST", `/api/companies/${segment(required(companyId, "company id"))}/issues`, {
      title,
      ...(description ? { description } : {}),
      ...(projectRef ? { projectId: await resolveProjectId(projectRef) } : {}),
      ...(assigneeRef ? { assigneeAgentId: (await resolveAgent(assigneeRef)).id } : {}),
      ...(parentId ? { parentId: await resolveTaskId(parentId) } : {}),
      status: assigneeRef ? "todo" : "backlog",
    }));
  }
  if (action === "assign") {
    return compactTask(await request("PATCH", `/api/issues/${segment(args[0])}`, {
      assigneeAgentId: required((await resolveAgent(args[1])).id, "agent id"),
      status: "todo",
    }));
  }
  if (action === "comment") {
    return compactComment(await request("POST", `/api/issues/${segment(args[0])}/comments`, {
      body: required(args.slice(1).join(" "), "message"),
    }));
  }
  if (action === "mention") {
    const taskRef = required(args.shift(), "task id");
    const agent = await resolveAgent(args.shift());
    const message = required(args.join(" "), "message");
    return compactComment(await request("POST", `/api/issues/${segment(taskRef)}/comments`, {
      body: `@${agent.name ?? agent.id} ${message}`,
    }));
  }
  if (["pause", "fail", "cancel"].includes(action)) {
    const taskRef = required(args.shift(), "task id");
    const summary = required(takeOption(args, ["-s", "--summary", "--reason"]), "reason");
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    const status = action === "pause" ? "paused" : action === "fail" ? "failed" : "cancelled";
    return compactTask(await request("PATCH", `/api/issues/${segment(taskRef)}`, { status, comment: summary }));
  }
  if (action === "block") {
    const taskRef = required(args.shift(), "task id");
    const summary = required(takeOption(args, ["-s", "--summary", "--reason"]), "reason");
    const dependencies = takeOption(args, ["--depends-on"]);
    const ownerRef = takeOption(args, ["--owner"]);
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    const blockedByIssueIds = dependencies
      ? await Promise.all(dependencies.split(/[|,]/).map((value) => resolveTaskId(value.trim())))
      : [];
    const owner = !ownerRef || ownerRef === "board"
      ? "board"
      : { agentId: required((await resolveAgent(ownerRef)).id, "agent id") };
    return compactTask(await request("PATCH", `/api/issues/${segment(taskRef)}`, {
      status: "blocked",
      comment: summary,
      ...(blockedByIssueIds.length > 0 ? { blockedByIssueIds } : { unblockDescriptor: { owner, action: summary } }),
    }));
  }
  if (action === "depend") {
    const taskRef = required(args.shift(), "task id");
    if (args.length === 0) fail("at least one blocker task is required");
    const blockerRefs = [...args];
    const blockedByIssueIds = await Promise.all(blockerRefs.map((value) => resolveTaskId(value)));
    return compactTask(await request("PATCH", `/api/issues/${segment(taskRef)}`, {
      status: "blocked",
      blockedByIssueIds,
      comment: `Waiting for ${blockerRefs.join(", ")}`,
    }));
  }
  if (action === "run") {
    const taskRef = required(args.shift(), "task id");
    const forceFreshSession = takeFlag(args, "--fresh");
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    const task = await request("GET", `/api/issues/${segment(taskRef)}`);
    const agentId = required(task?.assigneeAgentId, "task assignee");
    return request("POST", `/api/agents/${segment(agentId)}/wakeup`, {
      source: "on_demand",
      triggerDetail: "manual",
      reason: "light_cli_task_run",
      payload: { issueId: task.id },
      idempotencyKey: `pc-task-run:${task.id}:${Date.now()}`,
      forceFreshSession,
    });
  }
  if (action === "attach") {
    const taskId = required(args.shift(), "task id");
    const filePath = path.resolve(required(args.shift(), "file"));
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    const bytes = await fs.readFile(filePath).catch((error) => fail(`cannot read ${filePath}: ${error.message}`));
    if (!bytes || bytes.length === 0) fail("attachment is empty");
    const form = new FormData();
    const filename = path.basename(filePath);
    const contentType = MIME_BY_EXTENSION[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
    form.append("file", new Blob([bytes], { type: contentType }), filename);
    const companyId = required(process.env.PAPERCLIP_COMPANY_ID, "PAPERCLIP_COMPANY_ID");
    return compactAttachment(await request(
      "POST",
      `/api/companies/${segment(companyId)}/issues/${segment(taskId)}/attachments`,
      form,
    ));
  }
  if (action === "submit" || action === "done") {
    const taskId = required(args.shift(), "task id");
    const summary = takeOption(args, ["-s", "--summary"]);
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    if (action === "submit") {
      return request("POST", `/api/issues/${segment(taskId)}/light/reviews`, {
        summary: required(summary, "summary"),
        ...(process.env.PAPERCLIP_RUN_ID ? { sourceRunId: process.env.PAPERCLIP_RUN_ID } : {}),
      });
    }
    return compactTask(await request("PATCH", `/api/issues/${segment(taskId)}`, {
      status: "done",
      comment: required(summary, "summary"),
    }));
  }
  fail(`unknown task command: ${action ?? ""}\n\n${HELP}`);
}

async function agentCommand(action, args) {
  const companyId = required(process.env.PAPERCLIP_COMPANY_ID, "PAPERCLIP_COMPANY_ID");
  if (action === "list") {
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    return request("GET", `/api/companies/${segment(companyId)}/agents`);
  }
  if (action === "show") {
    const agent = await resolveAgent(args.shift());
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    return agent;
  }
  fail(`unknown agent command: ${action ?? ""}\n\n${HELP}`);
}

async function skillCommand(action, args) {
  if (action !== "list") fail(`unknown skill command: ${action ?? ""}\n\n${HELP}`);
  if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
  const companyId = required(process.env.PAPERCLIP_COMPANY_ID, "PAPERCLIP_COMPANY_ID");
  return request("GET", `/api/companies/${segment(companyId)}/skills`);
}

async function secretCommand(action, args) {
  if (action !== "list") fail(`unknown secret command: ${action ?? ""}\n\n${HELP}`);
  if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
  return request("GET", "/api/agents/me/secrets");
}

async function reviewCommand(action, args) {
  const taskId = required(args.shift(), "task id");
  if (action === "list") {
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    return request("GET", `/api/issues/${segment(taskId)}/light/reviews`);
  }
  if (action === "request") {
    const summary = required(takeOption(args, ["-s", "--summary"]), "summary");
    const reviewerAgentId = takeOption(args, ["--reviewer"]);
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    return request("POST", `/api/issues/${segment(taskId)}/light/reviews`, {
      summary,
      ...(reviewerAgentId ? { reviewerAgentId } : {}),
      ...(process.env.PAPERCLIP_RUN_ID ? { sourceRunId: process.env.PAPERCLIP_RUN_ID } : {}),
    });
  }
  if (action === "decide") {
    const reviewId = required(args.shift(), "review id");
    const decision = required(args.shift(), "decision");
    const summary = required(takeOption(args, ["-s", "--summary"]), "summary");
    const changes = takeOption(args, ["--changes"]);
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    return request("POST", `/api/issues/${segment(taskId)}/light/reviews/${segment(reviewId)}/decision`, {
      decision,
      summary,
      requiredChanges: changes ? changes.split("|").map((value) => value.trim()).filter(Boolean) : [],
      ...(process.env.PAPERCLIP_RUN_ID ? { decidedRunId: process.env.PAPERCLIP_RUN_ID } : {}),
    });
  }
  fail(`unknown review command: ${action ?? ""}\n\n${HELP}`);
}

async function memoryCommand(action, args) {
  const projectId = await resolveProjectId(args.shift());
  if (action === "list") {
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    return request("GET", `/api/projects/${segment(projectId)}/light/memory`);
  }
  if (action === "add") {
    const category = required(args.shift(), "category");
    const text = required(args.shift(), "text");
    const importance = positiveInteger(takeOption(args, ["--importance"]), "importance");
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    return request("POST", `/api/projects/${segment(projectId)}/light/memory`, {
      category,
      text,
      ...(importance ? { importance } : {}),
      ...(process.env.PAPERCLIP_TASK_ID ? { sourceIssueId: process.env.PAPERCLIP_TASK_ID } : {}),
      ...(process.env.PAPERCLIP_RUN_ID ? { sourceRunId: process.env.PAPERCLIP_RUN_ID } : {}),
    });
  }
  fail(`unknown memory command: ${action ?? ""}\n\n${HELP}`);
}

async function checkpointCommand(action, args) {
  const projectId = await resolveProjectId(args.shift());
  if (action === "list") {
    const taskRef = args.shift();
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    const taskId = taskRef ? await resolveTaskId(taskRef) : undefined;
    return request("GET", `/api/projects/${segment(projectId)}/light/checkpoints${taskId ? `?issueId=${segment(taskId)}` : ""}`);
  }
  const taskId = await resolveTaskId(args.shift());
  if (action === "save") {
    const summary = takeOption(args, ["-s", "--summary"]);
    if (args.length === 0) fail("at least one path is required");
    return request("POST", `/api/projects/${segment(projectId)}/light/checkpoints/${segment(taskId)}`, {
      paths: args,
      ...(summary ? { summary } : {}),
      ...(process.env.PAPERCLIP_RUN_ID ? { runId: process.env.PAPERCLIP_RUN_ID } : {}),
    });
  }
  if (action === "restore" || action === "discard") {
    const checkpointId = required(args.shift(), "checkpoint id");
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    if (action === "discard") {
      return request("DELETE", `/api/projects/${segment(projectId)}/light/checkpoints/${segment(taskId)}/${segment(checkpointId)}`);
    }
    return request("POST", `/api/projects/${segment(projectId)}/light/checkpoints/${segment(taskId)}/${segment(checkpointId)}/restore`, {
      ...(process.env.PAPERCLIP_RUN_ID ? { runId: process.env.PAPERCLIP_RUN_ID } : {}),
    });
  }
  fail(`unknown checkpoint command: ${action ?? ""}\n\n${HELP}`);
}

async function actionCommand(action, args) {
  if (action !== "request") fail(`unknown action command: ${action ?? ""}\n\n${HELP}`);
  const companyId = required(args.shift(), "company id");
  const actionKind = required(args.shift(), "action kind");
  const summary = required(takeOption(args, ["-s", "--summary"]), "summary");
  const idempotencyKey = required(takeOption(args, ["-k", "--key"]), "idempotency key");
  const issueId = takeOption(args, ["--task"]);
  const projectId = takeOption(args, ["--project"]);
  const targetBranch = takeOption(args, ["--target-branch"]);
  if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
  return request("POST", `/api/companies/${segment(companyId)}/light/actions`, {
    actionKind,
    summary,
    idempotencyKey,
    ...(targetBranch ? { payload: { targetBranch } } : {}),
    ...(issueId ? { issueId: await resolveTaskId(issueId) } : {}),
    ...(projectId ? { projectId: await resolveProjectId(projectId) } : {}),
    ...(process.env.PAPERCLIP_RUN_ID ? { requestingRunId: process.env.PAPERCLIP_RUN_ID } : {}),
  });
}

async function filesCommand(action, args) {
  const projectId = await resolveProjectId(args.shift());
  if (action === "status") {
    const taskRef = args.shift();
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    const taskId = taskRef ? await resolveTaskId(taskRef) : undefined;
    const query = taskId ? `?issueId=${segment(taskId)}` : "";
    return request("GET", `/api/projects/${segment(projectId)}/file-reservations${query}`);
  }
  const taskId = await resolveTaskId(args.shift());
  const leaseSeconds = positiveInteger(takeOption(args, ["--lease-seconds"]), "lease seconds");
  if (action === "reserve") {
    if (args.length === 0) fail("at least one path is required");
    return request("POST", `/api/projects/${segment(projectId)}/file-reservations/reserve`, {
      issueId: taskId,
      paths: args,
      ...(process.env.PAPERCLIP_RUN_ID ? { runId: process.env.PAPERCLIP_RUN_ID } : {}),
      ...(leaseSeconds ? { leaseSeconds } : {}),
    });
  }
  if (action === "renew") {
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
    return request("POST", `/api/projects/${segment(projectId)}/file-reservations/renew`, {
      issueId: taskId,
      ...(process.env.PAPERCLIP_RUN_ID ? { runId: process.env.PAPERCLIP_RUN_ID } : {}),
      ...(leaseSeconds ? { leaseSeconds } : {}),
    });
  }
  if (action === "release") {
    const force = takeFlag(args, "--force");
    return request("POST", `/api/projects/${segment(projectId)}/file-reservations/release`, {
      issueId: taskId,
      ...(args.length > 0 ? { paths: args } : {}),
      ...(process.env.PAPERCLIP_RUN_ID ? { runId: process.env.PAPERCLIP_RUN_ID } : {}),
      ...(force ? { force: true } : {}),
    });
  }
  fail(`unknown files command: ${action ?? ""}\n\n${HELP}`);
}

async function repoCommand(action, args) {
  const projectId = await resolveProjectId(args.shift());
  const taskId = await resolveTaskId(args.shift());
  if (!["status", "diff", "validate", "fetch", "sync", "commit", "merge", "push"].includes(action)) {
    fail(`unknown repo command: ${action ?? ""}\n\n${HELP}`);
  }
  const payload = {
    issueId: taskId,
    kind: action,
    ...(process.env.PAPERCLIP_RUN_ID ? { runId: process.env.PAPERCLIP_RUN_ID } : {}),
  };
  if (action === "commit") {
    payload.message = required(takeOption(args, ["-m", "--message"]), "commit message");
    if (args.length > 0) payload.paths = args;
  } else if (action === "push" || action === "merge") {
    payload.targetBranch = required(args.shift(), "target branch");
    if (action === "push") {
      const humanActionId = takeOption(args, ["--approval"]);
      if (humanActionId) payload.humanActionId = humanActionId;
    }
    if (args.length > 0) fail(`unexpected arguments: ${args.join(" ")}`);
  } else if (args.length > 0) {
    payload.paths = args;
  }
  return request("POST", `/api/projects/${segment(projectId)}/repository/operations`, payload);
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
  process.stdout.write(`${HELP}\n`);
  process.exit(0);
}

const group = args.shift();
const action = args.shift();
if (action === "--help" || action === "-h" || action === "help") {
  process.stdout.write(`${HELP}\n`);
  process.exit(0);
}
let result;
if (group === "task") result = await taskCommand(action, args);
else if (group === "files") result = await filesCommand(action, args);
else if (group === "repo") result = await repoCommand(action, args);
else if (group === "review") result = await reviewCommand(action, args);
else if (group === "memory") result = await memoryCommand(action, args);
else if (group === "checkpoint") result = await checkpointCommand(action, args);
else if (group === "action") result = await actionCommand(action, args);
else if (group === "agent") result = await agentCommand(action, args);
else if (group === "skill") result = await skillCommand(action, args);
else if (group === "secret") result = await secretCommand(action, args);
else fail(`unknown command group: ${group}\n\n${HELP}`);
print(result);
