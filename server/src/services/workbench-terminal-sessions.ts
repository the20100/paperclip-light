import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export interface WorkbenchTerminalSessionRecord {
  id: string;
  companyId: string;
  projectId: string | null;
  userId: string;
  cwd: string;
  cwdName: string;
  tokenHash: Buffer;
  expiresAt: Date;
}

const SESSION_TTL_MS = 60_000;
const sessions = new Map<string, WorkbenchTerminalSessionRecord>();

function hashToken(token: string) {
  return createHash("sha256").update(token).digest();
}

function sweep() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt.getTime() <= now) sessions.delete(id);
  }
}

export const workbenchTerminalSessionStore = {
  create(input: Omit<WorkbenchTerminalSessionRecord, "id" | "tokenHash" | "expiresAt">) {
    sweep();
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    sessions.set(id, { ...input, id, tokenHash: hashToken(token), expiresAt });
    return {
      sessionId: id,
      token,
      websocketPath: "/api/workbench/terminal/ws",
      cwd: input.cwd,
      cwdName: input.cwdName,
      expiresAt: expiresAt.toISOString(),
    };
  },

  consume(id: string, token: string) {
    sweep();
    const session = sessions.get(id);
    if (!session) return null;
    const receivedHash = hashToken(token);
    if (receivedHash.length !== session.tokenHash.length || !timingSafeEqual(receivedHash, session.tokenHash)) return null;
    sessions.delete(id);
    return session;
  },

  clear() {
    sessions.clear();
  },
};
