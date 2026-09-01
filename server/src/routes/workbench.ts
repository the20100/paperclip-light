import { createReadStream } from "node:fs";
import { Router } from "express";
import multer from "multer";
import type { Db } from "@paperclipai/db";
import { badRequest, unprocessable } from "../errors.js";
import { logActivity } from "../services/activity-log.js";
import { workbenchService } from "../services/workbench.js";
import { workbenchTerminalSessionStore } from "../services/workbench-terminal-sessions.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 25 * 1024 * 1024 },
});

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeFilename(value: string) {
  return value.replaceAll('"', "").replace(/[\\/\r\n]/g, "_") || "download";
}

export function workbenchRoutes(db: Db) {
  const router = Router();
  const service = workbenchService(db);

  const authorize = async (req: Parameters<typeof assertBoard>[0]) => {
    assertBoard(req);
    const rawCompanyId = req.params.companyId;
    const companyId = Array.isArray(rawCompanyId) ? rawCompanyId[0] : rawCompanyId;
    if (!companyId) throw badRequest("Company id is required");
    assertCompanyAccess(req, companyId);
    const projectId = stringOrNull(req.query.projectId ?? req.body?.projectId);
    return { companyId, projectId, root: await service.resolveRoot(companyId, projectId) };
  };

  router.get("/companies/:companyId/workbench", async (req, res) => {
    const { root } = await authorize(req);
    res.json({ root });
  });

  router.get("/companies/:companyId/workbench/files", async (req, res) => {
    const { root } = await authorize(req);
    res.json(await service.list(root, { path: req.query.path, q: req.query.q }));
  });

  router.get("/companies/:companyId/workbench/file", async (req, res) => {
    const { root } = await authorize(req);
    res.json(await service.read(root, req.query.path));
  });

  router.get("/companies/:companyId/workbench/download", async (req, res) => {
    const { root } = await authorize(req);
    const download = await service.download(root, req.query.path);
    const disposition = req.query.inline === "true" ? "inline" : "attachment";
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeFilename(download.relativePath.split("/").at(-1) ?? "download")}"`);
    res.setHeader("Content-Type", download.contentType ?? "application/octet-stream");
    res.setHeader("Content-Length", String(download.stats.size));
    createReadStream(download.absolute).pipe(res);
  });

  router.post("/companies/:companyId/workbench/folders", async (req, res) => {
    const { companyId, projectId, root } = await authorize(req);
    const entry = await service.createDirectory(root, req.body?.path);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "workbench.folder.created",
      entityType: projectId ? "project" : "company",
      entityId: projectId ?? companyId,
      details: { path: entry.path, scope: root.scope },
    });
    res.status(201).json({ entry });
  });

  router.put("/companies/:companyId/workbench/file", async (req, res) => {
    const { companyId, projectId, root } = await authorize(req);
    const file = await service.write(root, req.body?.path, req.body?.content, req.body?.expectedModifiedAt);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "workbench.file.saved",
      entityType: projectId ? "project" : "company",
      entityId: projectId ?? companyId,
      details: { path: file.path, size: file.size, scope: root.scope },
    });
    res.json({ file });
  });

  router.post("/companies/:companyId/workbench/upload", upload.single("file"), async (req, res) => {
    const { companyId, projectId, root } = await authorize(req);
    if (!req.file) throw unprocessable("Choose a file to upload", { code: "file_required" });
    const entry = await service.upload(root, req.body?.path, req.file.originalname, req.file.buffer);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "workbench.file.uploaded",
      entityType: projectId ? "project" : "company",
      entityId: projectId ?? companyId,
      details: { path: entry.path, size: entry.size, scope: root.scope },
    });
    res.status(201).json({ entry });
  });

  router.post("/companies/:companyId/workbench/move", async (req, res) => {
    const { companyId, projectId, root } = await authorize(req);
    const entry = await service.move(root, req.body?.path, req.body?.destination);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "workbench.entry.moved",
      entityType: projectId ? "project" : "company",
      entityId: projectId ?? companyId,
      details: { from: req.body?.path, to: entry.path, scope: root.scope },
    });
    res.json({ entry });
  });

  router.delete("/companies/:companyId/workbench/entry", async (req, res) => {
    const { companyId, projectId, root } = await authorize(req);
    const removed = await service.remove(root, req.body?.path, req.body?.recursive);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "workbench.entry.deleted",
      entityType: projectId ? "project" : "company",
      entityId: projectId ?? companyId,
      details: { path: removed.path, scope: root.scope },
    });
    res.json({ removed });
  });

  router.post("/companies/:companyId/workbench/terminal-sessions", async (req, res) => {
    const { companyId, projectId, root } = await authorize(req);
    const actor = getActorInfo(req);
    const session = workbenchTerminalSessionStore.create({
      companyId,
      projectId,
      userId: actor.actorId,
      cwd: root.path,
      cwdName: root.name,
    });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "workbench.terminal.opened",
      entityType: projectId ? "project" : "company",
      entityId: projectId ?? companyId,
      details: { scope: root.scope },
    });
    res.status(201).json(session);
  });

  return router;
}
