import { promises as fs } from "node:fs";
import path from "node:path";
import { companies, type Db } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { projectService } from "./projects.js";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";
import { conflict, notFound, unprocessable } from "../errors.js";

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

const MAX_LIST_ENTRIES = 500;
const MAX_SEARCH_RESULTS = 200;
const MAX_SEARCH_VISITS = 5_000;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const PROTECTED_SEGMENTS = new Set([".git", ".paperclip"]);
const SEARCH_PRUNED_SEGMENTS = new Set([
  ".git",
  ".paperclip",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  ".cache",
]);
const RESTRICTED_BASENAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".npmrc",
  ".pypirc",
  "credentials",
  "credentials.json",
  "id_rsa",
  "id_ed25519",
]);

export function normalizeWorkbenchRelativePath(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.includes("\0") || value.includes("\\")) {
    throw unprocessable("Invalid workbench path", { code: "invalid_path" });
  }
  const normalized = path.posix.normalize(value.replace(/^\/+/, ""));
  if (normalized === ".") return "";
  if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw unprocessable("Path escapes the workbench root", { code: "invalid_path" });
  }
  return normalized;
}

function isContained(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isRestricted(relativePath: string) {
  const base = path.posix.basename(relativePath).toLowerCase();
  return RESTRICTED_BASENAMES.has(base)
    || base.startsWith(".env.")
    || base.endsWith(".pem")
    || base.endsWith(".key")
    || base.endsWith(".p12")
    || base.endsWith(".pfx");
}

function assertMutablePath(relativePath: string) {
  if (!relativePath) throw unprocessable("The workbench root cannot be modified", { code: "root_protected" });
  const segments = relativePath.split("/");
  if (segments.some((segment) => PROTECTED_SEGMENTS.has(segment))) {
    throw unprocessable("This system path is protected in Files", { code: "protected_path" });
  }
}

function contentTypeFor(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  const known: Record<string, string> = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".json": "application/json",
    ".jsonl": "application/x-ndjson",
    ".js": "text/javascript",
    ".jsx": "text/javascript",
    ".ts": "text/typescript",
    ".tsx": "text/typescript",
    ".css": "text/css",
    ".html": "text/html",
    ".xml": "application/xml",
    ".yaml": "text/yaml",
    ".yml": "text/yaml",
    ".toml": "text/plain",
    ".py": "text/x-python",
    ".rb": "text/x-ruby",
    ".go": "text/x-go",
    ".rs": "text/x-rust",
    ".sh": "text/x-shellscript",
    ".sql": "text/x-sql",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
  };
  return known[extension] ?? null;
}

function isTextContentType(contentType: string | null) {
  return contentType?.startsWith("text/")
    || contentType === "application/json"
    || contentType === "application/xml"
    || contentType === "application/x-ndjson";
}

async function existingRealPath(root: string, relativePath: string) {
  const candidate = path.resolve(root, relativePath);
  if (!isContained(root, candidate)) throw unprocessable("Path escapes the workbench root", { code: "invalid_path" });
  let real: string;
  try {
    real = await fs.realpath(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw notFound("Workbench entry not found");
    throw error;
  }
  if (!isContained(root, real)) throw unprocessable("Symlink escapes the workbench root", { code: "invalid_path" });
  return real;
}

async function destinationPath(root: string, relativePath: string) {
  const candidate = path.resolve(root, relativePath);
  if (!isContained(root, candidate)) throw unprocessable("Path escapes the workbench root", { code: "invalid_path" });
  const parent = await existingRealPath(root, path.posix.dirname(relativePath) === "." ? "" : path.posix.dirname(relativePath));
  if (!isContained(root, parent)) throw unprocessable("Path escapes the workbench root", { code: "invalid_path" });
  return candidate;
}

async function toEntry(root: string, absolutePath: string): Promise<WorkbenchEntry> {
  const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
  const stats = await fs.lstat(absolutePath);
  return {
    name: path.basename(absolutePath),
    path: relativePath,
    kind: stats.isSymbolicLink() ? "symlink" : stats.isDirectory() ? "directory" : "file",
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    hidden: path.basename(absolutePath).startsWith("."),
    restricted: isRestricted(relativePath),
    contentType: stats.isFile() ? contentTypeFor(absolutePath) : null,
  };
}

export function workbenchService(db: Db) {
  const projects = projectService(db);

  async function resolveRoot(companyId: string, projectId?: string | null): Promise<WorkbenchRoot> {
    if (!projectId) {
      const company = await db.select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);
      if (!company) throw notFound("Company not found");
      const companyRoot = path.resolve(resolvePaperclipInstanceRoot(), "companies", companyId);
      await fs.mkdir(companyRoot, { recursive: true });
      return {
        scope: "company",
        companyId,
        projectId: null,
        name: company.name,
        path: await fs.realpath(companyRoot),
      };
    }

    const project = await projects.getById(projectId);
    if (!project || project.companyId !== companyId) throw notFound("Project not found");
    const configuredPath = project.primaryWorkspace?.cwd ?? project.codebase.effectiveLocalFolder;
    if (!configuredPath) {
      throw unprocessable("This project does not have a local workspace yet", { code: "workspace_unavailable" });
    }
    try {
      const real = await fs.realpath(configuredPath);
      const stats = await fs.stat(real);
      if (!stats.isDirectory()) throw unprocessable("The project workspace is not a directory", { code: "workspace_unavailable" });
      return { scope: "project", companyId, projectId, name: project.name, path: real };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw unprocessable("The project workspace does not exist on this host", { code: "workspace_unavailable" });
      }
      throw error;
    }
  }

  async function list(root: WorkbenchRoot, input: { path?: unknown; q?: unknown }) {
    const relativePath = normalizeWorkbenchRelativePath(input.path);
    const query = typeof input.q === "string" ? input.q.trim().toLowerCase() : "";
    const directory = await existingRealPath(root.path, relativePath);
    const directoryStats = await fs.stat(directory);
    if (!directoryStats.isDirectory()) throw unprocessable("Workbench path is not a directory", { code: "not_directory" });

    const entries: WorkbenchEntry[] = [];
    let truncated = false;
    if (!query) {
      const children = await fs.readdir(directory);
      for (const child of children.slice(0, MAX_LIST_ENTRIES)) {
        try { entries.push(await toEntry(root.path, path.join(directory, child))); } catch { /* transient entry */ }
      }
      truncated = children.length > MAX_LIST_ENTRIES;
    } else {
      const pending = [directory];
      let visited = 0;
      while (pending.length > 0 && entries.length < MAX_SEARCH_RESULTS && visited < MAX_SEARCH_VISITS) {
        const current = pending.shift()!;
        let children: string[];
        try { children = await fs.readdir(current); } catch { continue; }
        for (const child of children) {
          if (visited++ >= MAX_SEARCH_VISITS) break;
          const absolute = path.join(current, child);
          let entry: WorkbenchEntry;
          try { entry = await toEntry(root.path, absolute); } catch { continue; }
          if (entry.name.toLowerCase().includes(query) || entry.path.toLowerCase().includes(query)) entries.push(entry);
          if (entry.kind === "directory" && !SEARCH_PRUNED_SEGMENTS.has(child)) pending.push(absolute);
          if (entries.length >= MAX_SEARCH_RESULTS) break;
        }
      }
      truncated = pending.length > 0 || visited >= MAX_SEARCH_VISITS;
    }

    entries.sort((a, b) => {
      if (a.kind === "directory" && b.kind !== "directory") return -1;
      if (a.kind !== "directory" && b.kind === "directory") return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
    return { root, path: relativePath, entries, truncated, query: query || null };
  }

  async function read(root: WorkbenchRoot, inputPath: unknown) {
    const relativePath = normalizeWorkbenchRelativePath(inputPath);
    if (!relativePath) throw unprocessable("Select a file to preview", { code: "file_required" });
    if (isRestricted(relativePath)) throw unprocessable("Preview is disabled for secret-like files", { code: "restricted_file" });
    const absolute = await existingRealPath(root.path, relativePath);
    const stats = await fs.stat(absolute);
    if (!stats.isFile()) throw unprocessable("Workbench path is not a file", { code: "not_file" });
    const contentType = contentTypeFor(absolute);
    const text = isTextContentType(contentType) || (!contentType && stats.size <= MAX_TEXT_BYTES);
    if (!text) return { root, path: relativePath, name: path.basename(absolute), size: stats.size, modifiedAt: stats.mtime.toISOString(), contentType, kind: "binary" as const };
    if (stats.size > MAX_TEXT_BYTES) throw unprocessable("This file is too large to preview", { code: "file_too_large" });
    return {
      root,
      path: relativePath,
      name: path.basename(absolute),
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      contentType: contentType ?? "text/plain",
      kind: "text" as const,
      content: await fs.readFile(absolute, "utf8"),
    };
  }

  async function download(root: WorkbenchRoot, inputPath: unknown) {
    const relativePath = normalizeWorkbenchRelativePath(inputPath);
    if (!relativePath || isRestricted(relativePath)) throw unprocessable("This file cannot be downloaded", { code: "restricted_file" });
    const absolute = await existingRealPath(root.path, relativePath);
    const stats = await fs.stat(absolute);
    if (!stats.isFile()) throw unprocessable("Workbench path is not a file", { code: "not_file" });
    return { absolute, relativePath, stats, contentType: contentTypeFor(absolute) };
  }

  async function createDirectory(root: WorkbenchRoot, inputPath: unknown) {
    const relativePath = normalizeWorkbenchRelativePath(inputPath);
    assertMutablePath(relativePath);
    const absolute = await destinationPath(root.path, relativePath);
    try { await fs.mkdir(absolute); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw conflict("An entry already exists at this path");
      throw error;
    }
    return toEntry(root.path, absolute);
  }

  async function write(root: WorkbenchRoot, inputPath: unknown, content: unknown, expectedModifiedAt?: unknown) {
    const relativePath = normalizeWorkbenchRelativePath(inputPath);
    assertMutablePath(relativePath);
    if (isRestricted(relativePath)) throw unprocessable("Secret-like files cannot be edited in Files", { code: "restricted_file" });
    if (typeof content !== "string") throw unprocessable("File content must be text", { code: "invalid_content" });
    if (Buffer.byteLength(content, "utf8") > MAX_TEXT_BYTES) throw unprocessable("File content is too large", { code: "file_too_large" });
    const absolute = await destinationPath(root.path, relativePath);
    if (typeof expectedModifiedAt === "string") {
      try {
        const current = await fs.stat(absolute);
        if (current.mtime.toISOString() !== expectedModifiedAt) throw conflict("The file changed since it was opened");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    await fs.writeFile(absolute, content, { encoding: "utf8", flag: "w" });
    return read(root, relativePath);
  }

  async function upload(root: WorkbenchRoot, directoryPath: unknown, filename: string, bytes: Buffer) {
    const directoryRelative = normalizeWorkbenchRelativePath(directoryPath);
    const safeName = path.basename(filename).replace(/[\0/\\]/g, "").trim();
    if (!safeName || safeName === "." || safeName === "..") throw unprocessable("Invalid upload filename", { code: "invalid_path" });
    const relativePath = normalizeWorkbenchRelativePath(path.posix.join(directoryRelative, safeName));
    assertMutablePath(relativePath);
    if (isRestricted(relativePath)) throw unprocessable("Secret-like files cannot be uploaded in Files", { code: "restricted_file" });
    const absolute = await destinationPath(root.path, relativePath);
    try { await fs.writeFile(absolute, bytes, { flag: "wx" }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw conflict("An entry already exists at this path");
      throw error;
    }
    return toEntry(root.path, absolute);
  }

  async function move(root: WorkbenchRoot, sourceValue: unknown, destinationValue: unknown) {
    const source = normalizeWorkbenchRelativePath(sourceValue);
    const destination = normalizeWorkbenchRelativePath(destinationValue);
    assertMutablePath(source);
    assertMutablePath(destination);
    const absoluteSource = await existingRealPath(root.path, source);
    const absoluteDestination = await destinationPath(root.path, destination);
    try { await fs.access(absoluteDestination); throw conflict("An entry already exists at the destination"); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await fs.rename(absoluteSource, absoluteDestination);
    return toEntry(root.path, absoluteDestination);
  }

  async function remove(root: WorkbenchRoot, inputPath: unknown, recursive: unknown) {
    const relativePath = normalizeWorkbenchRelativePath(inputPath);
    assertMutablePath(relativePath);
    const absolute = await existingRealPath(root.path, relativePath);
    const stats = await fs.lstat(absolute);
    if (stats.isDirectory() && recursive !== true) {
      const children = await fs.readdir(absolute);
      if (children.length > 0) throw conflict("Directory is not empty");
    }
    await fs.rm(absolute, { recursive: recursive === true, force: false });
    return { path: relativePath };
  }

  return { resolveRoot, list, read, download, createDirectory, write, upload, move, remove };
}
