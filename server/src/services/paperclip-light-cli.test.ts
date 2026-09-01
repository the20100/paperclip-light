import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const cleanupDirs = new Set<string>();
const openServers = new Set<http.Server>();
const cliPath = fileURLToPath(new URL("./scripts/paperclip-light-cli.mjs", import.meta.url));

afterEach(async () => {
  await Promise.all(Array.from(openServers, (server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  openServers.clear();
  await Promise.all(Array.from(cleanupDirs, (dir) => fs.rm(dir, { recursive: true, force: true })));
  cleanupDirs.clear();
});

async function listen(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  openServers.add(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not expose a TCP port");
  return `http://127.0.0.1:${address.port}`;
}

async function runCli(apiUrl: string, args: string[]) {
  const child = spawn(process.execPath, [cliPath, ...args], {
    env: {
      ...process.env,
      PAPERCLIP_API_URL: apiUrl,
      PAPERCLIP_API_KEY: "run-secret-token",
      PAPERCLIP_RUN_ID: "run-1",
      PAPERCLIP_COMPANY_ID: "company-1",
      PAPERCLIP_PROJECT_ID: "project-1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exitCode = await new Promise<number | null>((resolve) => child.on("close", resolve));
  return { exitCode, stdout, stderr };
}

describe("Paperclip Light runtime CLI", () => {
  it("reads a task with the injected run identity", async () => {
    let observedAuthorization: string | undefined;
    let observedRunId: string | undefined;
    const apiUrl = await listen((req, res) => {
      observedAuthorization = req.headers.authorization;
      observedRunId = typeof req.headers["x-paperclip-run-id"] === "string"
        ? req.headers["x-paperclip-run-id"]
        : undefined;
      expect(req.method).toBe("GET");
      expect(req.url).toBe("/api/issues/COM-2");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        id: "issue-2",
        identifier: "COM-2",
        title: "Compact task",
        status: "todo",
        changes: { status: { from: "backlog", to: "todo" } },
        project: { id: "project-1", workspaces: [{ huge: "unused" }] },
      }));
    });

    const result = await runCli(apiUrl, ["task", "show", "COM-2"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      id: "issue-2",
      identifier: "COM-2",
      title: "Compact task",
      status: "todo",
    });
    expect(observedAuthorization).toBe("Bearer run-secret-token");
    expect(observedRunId).toBe("run-1");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("run-secret-token");
  });

  it("uploads a file deliverable as multipart data", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-light-cli-test-"));
    cleanupDirs.add(tempDir);
    const deliverablePath = path.join(tempDir, "result.md");
    await fs.writeFile(deliverablePath, "# Result\n\nDone.\n");
    let requestBody = Buffer.alloc(0);
    let contentType = "";
    const apiUrl = await listen((req, res) => {
      expect(req.method).toBe("POST");
      expect(req.url).toBe("/api/companies/company-1/issues/COM-2/attachments");
      contentType = String(req.headers["content-type"] ?? "");
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        requestBody = Buffer.concat(chunks);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "attachment-1", originalFilename: "result.md" }));
      });
    });

    const result = await runCli(apiUrl, ["task", "attach", "COM-2", deliverablePath]);

    expect(result.exitCode).toBe(0);
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(requestBody.toString("utf8")).toContain('filename="result.md"');
    expect(requestBody.toString("utf8")).toContain("# Result");
    expect(JSON.parse(result.stdout)).toMatchObject({
      id: "attachment-1",
      filename: "result.md",
    });
  });

  it("prints help for a command group without contacting the API", async () => {
    const result = await runCli("http://127.0.0.1:1", ["task", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("pc task show TASK [--full]");
    expect(result.stderr).toBe("");
  });

  it("resolves a task identifier before reserving files", async () => {
    const observed: Array<{ method?: string; url?: string; body?: string }> = [];
    const taskId = "44444444-4444-4444-8444-444444444444";
    const apiUrl = await listen((req, res) => {
      if (req.method === "GET") {
        observed.push({ method: req.method, url: req.url });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: taskId, identifier: "COM-4" }));
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        observed.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString("utf8") });
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "active", reservations: [], conflicts: [] }));
      });
    });

    const result = await runCli(apiUrl, ["files", "reserve", "project-1", "COM-4", "ui/src/App.tsx"]);

    expect(result.exitCode).toBe(0);
    expect(observed[0]).toMatchObject({ method: "GET", url: "/api/issues/COM-4" });
    expect(observed[1]).toMatchObject({
      method: "POST",
      url: "/api/projects/project-1/file-reservations/reserve",
    });
    expect(JSON.parse(observed[1]!.body!)).toMatchObject({ issueId: taskId, paths: ["ui/src/App.tsx"] });
  });

  it("forwards a deployment approval when pushing", async () => {
    const taskId = "44444444-4444-4444-8444-444444444444";
    const approvalId = "55555555-5555-4555-8555-555555555555";
    let requestBody = "";
    const apiUrl = await listen((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        requestBody = Buffer.concat(chunks).toString("utf8");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ operation: { id: "operation-1", status: "succeeded" } }));
      });
    });

    const result = await runCli(apiUrl, [
      "repo", "push", "project-1", taskId, "main", "--approval", approvalId,
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(requestBody)).toMatchObject({
      issueId: taskId,
      kind: "push",
      targetBranch: "main",
      humanActionId: approvalId,
    });
  });
});
