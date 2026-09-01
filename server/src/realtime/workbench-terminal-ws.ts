import type { IncomingMessage, Server as HttpServer } from "node:http";
import { createRequire } from "node:module";
import type { Duplex } from "node:stream";
import { chmodSync, existsSync } from "node:fs";
import path from "node:path";
import { logger } from "../middleware/logger.js";
import { workbenchTerminalSessionStore } from "../services/workbench-terminal-sessions.js";

interface TerminalSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
  on(event: "message", listener: (data: unknown) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
}

interface TerminalServer {
  clients: Set<TerminalSocket>;
  on(event: "connection", listener: (socket: TerminalSocket, req: IncomingMessage) => void): void;
  close(callback?: (error?: Error) => void): void;
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, callback: (ws: TerminalSocket) => void): void;
  emit(event: "connection", ws: TerminalSocket, req: IncomingMessage): boolean;
}

interface WorkbenchUpgradeRequest extends IncomingMessage {
  paperclipWebSocketHandled?: boolean;
}

type PtyProcess = {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): { dispose(): void };
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void };
};

const require = createRequire(import.meta.url);
// Some package managers unpack node-pty's Unix helper without its executable
// bit. Repair that package-local mode before the first spawn; no workspace or
// user file is touched.
if (process.platform !== "win32") {
  const nodePtyRoot = path.resolve(path.dirname(require.resolve("node-pty")), "..");
  const spawnHelper = path.join(nodePtyRoot, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper");
  if (existsSync(spawnHelper)) {
    try { chmodSync(spawnHelper, 0o755); } catch { /* spawn will return a safe startup error */ }
  }
}
const { WebSocket, WebSocketServer } = require("ws") as {
  WebSocket: { OPEN: number };
  WebSocketServer: new (options: { noServer: boolean }) => TerminalServer;
};
const pty = require("node-pty") as {
  spawn(file: string, args: string[], options: Record<string, unknown>): PtyProcess;
};

const AUTH_TIMEOUT_MS = 10_000;
const MAX_CONNECTIONS_PER_USER = 4;
const MAX_INPUT_CHARS = 64 * 1024;

function parseMessage(data: unknown) {
  const text = typeof data === "string" ? data : Buffer.isBuffer(data) ? data.toString("utf8") : "";
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return null; }
}

function send(socket: TerminalSocket, frame: Record<string, unknown>) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
}

function safeEnvironment() {
  const blocked = /(TOKEN|SECRET|PASSWORD|DATABASE_URL|PRIVATE_KEY|API_KEY|COOKIE|SESSION|PAPERCLIP_.*KEY)/i;
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string" && !blocked.test(key)) env[key] = value;
  }
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  return env;
}

function dimensions(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value < 1_000 ? value : fallback;
}

function isWorkbenchTerminalPath(rawUrl: string | undefined) {
  if (!rawUrl) return false;
  try { return new URL(rawUrl, "http://localhost").pathname === "/api/workbench/terminal/ws"; } catch { return false; }
}

export function setupWorkbenchTerminalWebSocketServer(server: HttpServer) {
  const socketServer = new WebSocketServer({ noServer: true });
  const activeByUser = new Map<string, number>();
  const livePtys = new Set<PtyProcess>();

  const upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!isWorkbenchTerminalPath(req.url)) return;
    const ownedRequest = req as WorkbenchUpgradeRequest;
    if (ownedRequest.paperclipWebSocketHandled) return;
    ownedRequest.paperclipWebSocketHandled = true;
    socketServer.handleUpgrade(req, socket, head, (ws) => socketServer.emit("connection", ws, req));
  };
  server.on("upgrade", upgrade);

  socketServer.on("connection", (socket) => {
    let terminal: PtyProcess | null = null;
    let authenticated = false;
    let userId: string | null = null;
    const authTimer = setTimeout(() => socket.close(4401, "Authentication timeout"), AUTH_TIMEOUT_MS);
    authTimer.unref?.();

    const cleanup = () => {
      clearTimeout(authTimer);
      if (terminal) {
        livePtys.delete(terminal);
        try { terminal.kill(); } catch { /* already closed */ }
        terminal = null;
      }
      if (userId) {
        const count = activeByUser.get(userId) ?? 0;
        if (count <= 1) activeByUser.delete(userId);
        else activeByUser.set(userId, count - 1);
        userId = null;
      }
    };

    socket.on("message", (raw) => {
      const frame = parseMessage(raw);
      if (!frame) return;
      if (!authenticated) {
        if (frame.type !== "auth" || typeof frame.sessionId !== "string" || typeof frame.token !== "string") {
          socket.close(4401, "Authentication required");
          return;
        }
        const session = workbenchTerminalSessionStore.consume(frame.sessionId, frame.token);
        if (!session) {
          socket.close(4401, "Invalid or expired terminal session");
          return;
        }
        const active = activeByUser.get(session.userId) ?? 0;
        if (active >= MAX_CONNECTIONS_PER_USER) {
          socket.close(4429, "Too many open terminals");
          return;
        }
        clearTimeout(authTimer);
        authenticated = true;
        userId = session.userId;
        activeByUser.set(userId, active + 1);
        const shell = process.env.SHELL?.trim() || (process.platform === "win32" ? "powershell.exe" : "/bin/sh");
        try {
          terminal = pty.spawn(shell, process.platform === "win32" ? [] : ["-l"], {
            cwd: session.cwd,
            env: safeEnvironment(),
            name: "xterm-256color",
            cols: dimensions(frame.cols, 100),
            rows: dimensions(frame.rows, 30),
          });
          livePtys.add(terminal);
          terminal.onData((data) => send(socket, { type: "output", data }));
          terminal.onExit(({ exitCode }) => {
            send(socket, { type: "exit", exitCode });
            socket.close(1000, "Shell exited");
          });
          send(socket, { type: "ready", cwd: session.cwd, cwdName: session.cwdName });
        } catch (error) {
          logger.error({ errorName: error instanceof Error ? error.name : typeof error }, "failed to open workbench terminal");
          send(socket, { type: "error", message: "The terminal could not be started on this host." });
          socket.close(1011, "Terminal startup failed");
        }
        return;
      }

      if (!terminal) return;
      if (frame.type === "input" && typeof frame.data === "string" && frame.data.length <= MAX_INPUT_CHARS) {
        terminal.write(frame.data);
      } else if (frame.type === "resize") {
        terminal.resize(dimensions(frame.cols, 100), dimensions(frame.rows, 30));
      }
    });
    socket.on("close", cleanup);
    socket.on("error", (error) => {
      logger.debug({ errorName: error.name }, "workbench terminal websocket error");
      cleanup();
    });
  });

  const controller = {
    close() {
      server.off("upgrade", upgrade);
      workbenchTerminalSessionStore.clear();
      for (const terminal of livePtys) {
        try { terminal.kill(); } catch { /* already closed */ }
      }
      livePtys.clear();
      for (const socket of socketServer.clients) socket.terminate();
      socketServer.close();
    },
  };
  server.once("close", () => controller.close());
  return controller;
}
