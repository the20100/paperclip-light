import { api } from "./client";

export type WorkbenchScope = "company" | "project";

export interface WorkbenchRoot {
  scope: WorkbenchScope;
  companyId: string;
  projectId: string | null;
  name: string;
  path: string;
}

export interface WorkbenchEntry {
  name: string;
  path: string;
  kind: "file" | "directory" | "symlink";
  size: number;
  modifiedAt: string;
  hidden: boolean;
  restricted: boolean;
  contentType: string | null;
}

export interface WorkbenchFileContent {
  root: WorkbenchRoot;
  path: string;
  name: string;
  size: number;
  modifiedAt: string;
  contentType: string | null;
  kind: "text" | "binary";
  content?: string;
}

export interface WorkbenchTerminalSession {
  sessionId: string;
  token: string;
  websocketPath: string;
  cwd: string;
  cwdName: string;
  expiresAt: string;
}

function scopeQuery(projectId?: string | null) {
  return projectId ? `projectId=${encodeURIComponent(projectId)}` : "";
}

function withQuery(path: string, query: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const encoded = params.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export const workbenchApi = {
  root: (companyId: string, projectId?: string | null) =>
    api.get<{ root: WorkbenchRoot }>(withQuery(`/companies/${companyId}/workbench`, { projectId })),
  list: (companyId: string, input: { projectId?: string | null; path?: string; q?: string }, signal?: AbortSignal) =>
    api.get<{ root: WorkbenchRoot; path: string; entries: WorkbenchEntry[]; truncated: boolean; query: string | null }>(
      withQuery(`/companies/${companyId}/workbench/files`, input),
      { signal },
    ),
  read: (companyId: string, input: { projectId?: string | null; path: string }, signal?: AbortSignal) =>
    api.get<WorkbenchFileContent>(withQuery(`/companies/${companyId}/workbench/file`, input), { signal }),
  downloadUrl: (companyId: string, input: { projectId?: string | null; path: string }) =>
    `/api${withQuery(`/companies/${companyId}/workbench/download`, input)}`,
  previewUrl: (companyId: string, input: { projectId?: string | null; path: string }) =>
    `/api${withQuery(`/companies/${companyId}/workbench/download`, { ...input, inline: "true" })}`,
  createFolder: (companyId: string, input: { projectId?: string | null; path: string }) =>
    api.post<{ entry: WorkbenchEntry }>(`/companies/${companyId}/workbench/folders`, input),
  saveFile: (companyId: string, input: { projectId?: string | null; path: string; content: string; expectedModifiedAt?: string }) =>
    api.put<{ file: WorkbenchFileContent }>(`/companies/${companyId}/workbench/file`, input),
  upload: (companyId: string, input: { projectId?: string | null; path: string; file: File }) => {
    const form = new FormData();
    if (input.projectId) form.set("projectId", input.projectId);
    form.set("path", input.path);
    form.set("file", input.file);
    return api.postForm<{ entry: WorkbenchEntry }>(`/companies/${companyId}/workbench/upload${scopeQuery(input.projectId) ? `?${scopeQuery(input.projectId)}` : ""}`, form);
  },
  move: (companyId: string, input: { projectId?: string | null; path: string; destination: string }) =>
    api.post<{ entry: WorkbenchEntry }>(`/companies/${companyId}/workbench/move`, input),
  remove: (companyId: string, input: { projectId?: string | null; path: string; recursive?: boolean }) =>
    api.deleteWithBody<{ removed: { path: string } }>(`/companies/${companyId}/workbench/entry`, input),
  createTerminalSession: (companyId: string, projectId?: string | null) =>
    api.post<WorkbenchTerminalSession>(`/companies/${companyId}/workbench/terminal-sessions`, { projectId }),
};
