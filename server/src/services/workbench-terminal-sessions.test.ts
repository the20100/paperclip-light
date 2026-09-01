import { describe, expect, it } from "vitest";
import { workbenchTerminalSessionStore } from "./workbench-terminal-sessions.js";

describe("workbenchTerminalSessionStore", () => {
  it("mints a one-time terminal credential without exposing the stored hash", () => {
    workbenchTerminalSessionStore.clear();
    const session = workbenchTerminalSessionStore.create({
      companyId: "company-1",
      projectId: "project-1",
      userId: "user-1",
      cwd: "/tmp/project",
      cwdName: "Project",
    });

    expect(session.token).toHaveLength(43);
    expect(session.websocketPath).toBe("/api/workbench/terminal/ws");
    expect(workbenchTerminalSessionStore.consume(session.sessionId, "wrong-token")).toBeNull();
    expect(workbenchTerminalSessionStore.consume(session.sessionId, session.token)).toMatchObject({
      companyId: "company-1",
      projectId: "project-1",
      userId: "user-1",
      cwd: "/tmp/project",
    });
    expect(workbenchTerminalSessionStore.consume(session.sessionId, session.token)).toBeNull();
  });
});
