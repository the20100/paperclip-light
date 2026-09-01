import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import {
  captureTaskCheckpointSchema,
  claimHumanActionSchema,
  completeHumanActionSchema,
  createHumanActionSchema,
  decideHumanActionSchema,
  projectMemoryCreateSchema,
  projectMemoryUpdateSchema,
  reconcileHumanActionSchema,
  releaseProjectFilesSchema,
  renewProjectFilesSchema,
  repositoryOperationSchema,
  reserveProjectFilesSchema,
  restoreTaskCheckpointSchema,
  rollbackLightConfigurationSchema,
  taskReviewDecisionSchema,
  taskReviewRequestSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import {
  lightFileReservationService,
  lightControlService,
  lightRepositoryService,
  lightTaskCheckpointService,
  heartbeatService,
  logActivity,
  companyService,
  issueService,
  projectService,
} from "../services/index.js";
import { assertCompanyAccess, getAccessibleResource, getActorInfo, hasCompanyAccess } from "./authz.js";

export function lightExecutionRoutes(db: Db) {
  const router = Router();
  const projects = projectService(db);
  const companies = companyService(db);
  const issues = issueService(db);
  const controls = lightControlService(db);
  const reservations = lightFileReservationService(db);
  const repositories = lightRepositoryService(db);
  const checkpoints = lightTaskCheckpointService(db);
  const heartbeats = heartbeatService(db);

  async function accessibleProject(req: Request, res: Response) {
    const projectId = req.params.id as string;
    return getAccessibleResource(req, res, projects.getById(projectId), "Project not found");
  }

  async function accessibleCompany(req: Request, res: Response) {
    const companyId = req.params.companyId as string;
    const company = await companies.getById(companyId);
    if (!company || !hasCompanyAccess(req, company.id)) {
      res.status(404).json({ error: "Company not found" });
      return null;
    }
    assertCompanyAccess(req, company.id);
    return company;
  }

  async function accessibleIssue(req: Request, res: Response) {
    const issueId = req.params.id as string;
    return getAccessibleResource(req, res, issues.getById(issueId), "Task not found");
  }

  router.get("/companies/:companyId/light/execution-events", async (req, res) => {
    const company = await accessibleCompany(req, res);
    if (!company) return;
    res.json(await controls.listExecutionEvents(company.id, {
      issueId: typeof req.query.issueId === "string" ? req.query.issueId : undefined,
      limit: typeof req.query.limit === "string" ? Number(req.query.limit) : undefined,
    }));
  });

  router.get("/companies/:companyId/light/actions", async (req, res) => {
    const company = await accessibleCompany(req, res);
    if (!company) return;
    res.json(await controls.listHumanActions(company.id, typeof req.query.status === "string" ? req.query.status : undefined));
  });

  router.get("/companies/:companyId/light/action-center", async (req, res) => {
    const company = await accessibleCompany(req, res);
    if (!company) return;
    res.json(await controls.actionCenter(company.id));
  });

  router.get("/companies/:companyId/light/migration-preview", async (req, res) => {
    const company = await accessibleCompany(req, res);
    if (!company) return;
    res.json(await controls.migrationPreview(company.id));
  });

  router.get("/companies/:companyId/light/quality-summary", async (req, res) => {
    const company = await accessibleCompany(req, res);
    if (!company) return;
    res.json(await controls.qualitySummary(company.id));
  });

  router.get("/companies/:companyId/light/config-revisions", async (req, res) => {
    const company = await accessibleCompany(req, res);
    if (!company) return;
    res.json(await controls.listConfigurationRevisions(company.id));
  });

  router.post(
    "/companies/:companyId/light/config-revisions/rollback",
    validate(rollbackLightConfigurationSchema),
    async (req, res) => {
      const company = await accessibleCompany(req, res);
      if (!company) return;
      res.json(await controls.rollbackConfiguration(company.id, req.body, getActorInfo(req)));
    },
  );

  router.get("/heartbeat-runs/:runId/light/context", async (req, res) => {
    const run = await getAccessibleResource(
      req,
      res,
      heartbeats.getRun(req.params.runId as string),
      "Run not found",
    );
    if (!run) return;
    res.json(await controls.listRunContext(run.id));
  });

  router.post("/companies/:companyId/light/actions", validate(createHumanActionSchema), async (req, res) => {
    const company = await accessibleCompany(req, res);
    if (!company) return;
    res.status(201).json(await controls.createHumanAction(company.id, req.body, getActorInfo(req)));
  });

  router.post("/companies/:companyId/light/actions/:actionId/decision", validate(decideHumanActionSchema), async (req, res) => {
    const company = await accessibleCompany(req, res);
    if (!company) return;
    res.json(await controls.decideHumanAction(company.id, req.params.actionId as string, req.body, getActorInfo(req)));
  });

  router.post("/companies/:companyId/light/actions/:actionId/claim", validate(claimHumanActionSchema), async (req, res) => {
    const company = await accessibleCompany(req, res);
    if (!company) return;
    res.json(await controls.claimHumanAction(company.id, req.params.actionId as string, req.body));
  });

  router.post("/companies/:companyId/light/actions/:actionId/complete", validate(completeHumanActionSchema), async (req, res) => {
    const company = await accessibleCompany(req, res);
    if (!company) return;
    res.json(await controls.completeHumanAction(company.id, req.params.actionId as string, req.body));
  });

  router.post("/companies/:companyId/light/actions/:actionId/reconcile", validate(reconcileHumanActionSchema), async (req, res) => {
    const company = await accessibleCompany(req, res);
    if (!company) return;
    res.json(await controls.reconcileHumanAction(
      company.id,
      req.params.actionId as string,
      req.body,
      getActorInfo(req),
    ));
  });

  router.get("/issues/:id/light/reviews", async (req, res) => {
    const issue = await accessibleIssue(req, res);
    if (!issue) return;
    res.json(await controls.listTaskReviews(issue.id));
  });

  router.post("/issues/:id/light/reviews", validate(taskReviewRequestSchema), async (req, res) => {
    const issue = await accessibleIssue(req, res);
    if (!issue) return;
    res.status(201).json(await controls.requestTaskReview(issue.id, req.body, getActorInfo(req)));
  });

  router.post("/issues/:id/light/reviews/:reviewId/decision", validate(taskReviewDecisionSchema), async (req, res) => {
    const issue = await accessibleIssue(req, res);
    if (!issue) return;
    res.json(await controls.decideTaskReview(issue.id, req.params.reviewId as string, req.body, getActorInfo(req)));
  });

  router.get("/projects/:id/light/memory", async (req, res) => {
    const project = await accessibleProject(req, res);
    if (!project) return;
    res.json(await controls.listProjectMemory(project.id, req.query.includeArchived === "true"));
  });

  router.post("/projects/:id/light/memory", validate(projectMemoryCreateSchema), async (req, res) => {
    const project = await accessibleProject(req, res);
    if (!project) return;
    res.status(201).json(await controls.createProjectMemory(project.id, req.body));
  });

  router.patch("/projects/:id/light/memory/:memoryId", validate(projectMemoryUpdateSchema), async (req, res) => {
    const project = await accessibleProject(req, res);
    if (!project) return;
    res.json(await controls.updateProjectMemory(project.id, req.params.memoryId as string, req.body));
  });

  router.get("/projects/:id/light/checkpoints", async (req, res) => {
    const project = await accessibleProject(req, res);
    if (!project) return;
    const result = await checkpoints.list(project.id, typeof req.query.issueId === "string" ? req.query.issueId : undefined);
    res.json(result.rows);
  });

  router.post("/projects/:id/light/checkpoints/:issueId", validate(captureTaskCheckpointSchema), async (req, res) => {
    const project = await accessibleProject(req, res);
    if (!project) return;
    res.status(201).json(await checkpoints.capture(
      project.id,
      req.params.issueId as string,
      req.body,
      getActorInfo(req),
    ));
  });

  router.post(
    "/projects/:id/light/checkpoints/:issueId/:checkpointId/restore",
    validate(restoreTaskCheckpointSchema),
    async (req, res) => {
      const project = await accessibleProject(req, res);
      if (!project) return;
      res.json(await checkpoints.restore(
        project.id,
        req.params.issueId as string,
        req.params.checkpointId as string,
        req.body,
        getActorInfo(req),
      ));
    },
  );

  router.delete("/projects/:id/light/checkpoints/:issueId/:checkpointId", async (req, res) => {
    const project = await accessibleProject(req, res);
    if (!project) return;
    res.json(await checkpoints.discard(
      project.id,
      req.params.issueId as string,
      req.params.checkpointId as string,
      getActorInfo(req),
    ));
  });

  router.get("/projects/:id/file-reservations", async (req, res) => {
    const project = await accessibleProject(req, res);
    if (!project) return;
    const result = await reservations.list(project.id, {
      issueId: typeof req.query.issueId === "string" ? req.query.issueId : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
    });
    res.json(result.rows);
  });

  router.post(
    "/projects/:id/file-reservations/reserve",
    validate(reserveProjectFilesSchema),
    async (req, res) => {
      const project = await accessibleProject(req, res);
      if (!project) return;
      const actor = getActorInfo(req);
      const { result } = await reservations.reserve(project.id, req.body, actor);
      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: result.status === "active" ? "project.files_reserved" : "project.files_waiting",
        entityType: "project",
        entityId: project.id,
        details: {
          issueId: req.body.issueId,
          requestId: result.requestId,
          pathCount: result.reservations.length,
          conflictCount: result.conflicts.length,
        },
      });
      res.status(result.status === "active" ? 201 : 202).json(result);
    },
  );

  router.post(
    "/projects/:id/file-reservations/renew",
    validate(renewProjectFilesSchema),
    async (req, res) => {
      const project = await accessibleProject(req, res);
      if (!project) return;
      const actor = getActorInfo(req);
      const result = await reservations.renew(project.id, req.body, actor);
      res.json(result.rows);
    },
  );

  router.post(
    "/projects/:id/file-reservations/release",
    validate(releaseProjectFilesSchema),
    async (req, res) => {
      const project = await accessibleProject(req, res);
      if (!project) return;
      const actor = getActorInfo(req);
      const result = await reservations.release(project.id, req.body, actor);
      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: req.body.force ? "project.files_force_released" : "project.files_released",
        entityType: "project",
        entityId: project.id,
        details: {
          issueId: req.body.issueId,
          releasedCount: result.released.length,
          promotedCount: result.promoted.length,
        },
      });
      res.json({ released: result.released, promoted: result.promoted });
    },
  );

  router.get("/projects/:id/repository/operations", async (req, res) => {
    const project = await accessibleProject(req, res);
    if (!project) return;
    const result = await repositories.listOperations(
      project.id,
      typeof req.query.issueId === "string" ? req.query.issueId : undefined,
    );
    res.json(result.rows);
  });

  router.post(
    "/projects/:id/repository/operations",
    validate(repositoryOperationSchema),
    async (req, res) => {
      const project = await accessibleProject(req, res);
      if (!project) return;
      const actor = getActorInfo(req);
      const result = await repositories.run(project.id, req.body, actor);
      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: `project.repository_${result.operation.kind}`,
        entityType: "project",
        entityId: project.id,
        details: {
          issueId: req.body.issueId,
          operationId: result.operation.id,
          status: result.operation.status,
          pathCount: result.operation.paths?.length ?? 0,
          targetBranch: result.operation.targetBranch,
          commitSha: result.operation.commitSha,
        },
      });
      res.status(201).json(result.operation);
    },
  );

  return router;
}
