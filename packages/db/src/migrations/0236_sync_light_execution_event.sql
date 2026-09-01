CREATE OR REPLACE FUNCTION "paperclip_sync_light_execution_event"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  candidate_issue text;
  resolved_issue uuid;
  resolved_project uuid;
  event_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = NEW.company_id AND c.execution_profile = 'light'
  ) THEN
    RETURN NEW;
  END IF;

  candidate_issue := COALESCE(
    NEW.native_issue_id::text,
    NULLIF(NEW.context_snapshot ->> 'issueId', ''),
    NULLIF(NEW.context_snapshot ->> 'taskId', '')
  );
  IF candidate_issue IS NULL OR candidate_issue !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN NEW;
  END IF;
  resolved_issue := candidate_issue::uuid;
  SELECT i.project_id INTO resolved_project
  FROM public.issues i
  WHERE i.id = resolved_issue AND i.company_id = NEW.company_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  event_status := CASE
    WHEN NEW.status IN ('queued', 'pending') THEN 'pending'
    WHEN NEW.status IN ('running', 'starting') THEN 'dispatched'
    WHEN NEW.status IN ('succeeded', 'completed') THEN 'completed'
    WHEN NEW.status IN ('cancelled', 'canceled') THEN 'cancelled'
    WHEN NEW.status IN ('failed', 'timed_out', 'timeout') THEN 'conflict'
    ELSE 'claimed'
  END;

  INSERT INTO public.light_execution_events (
    company_id, project_id, issue_id, target_agent_id, run_id, kind,
    idempotency_key, payload, status, claimed_at, dispatched_at, completed_at,
    created_at, updated_at
  ) VALUES (
    NEW.company_id,
    resolved_project,
    resolved_issue,
    NEW.agent_id,
    NEW.id,
    COALESCE(NULLIF(NEW.context_snapshot ->> 'wakeReason', ''), NULLIF(NEW.trigger_detail, ''), NEW.invocation_source),
    COALESCE('wakeup:' || NEW.wakeup_request_id::text, 'run:' || NEW.id::text),
    jsonb_build_object(
      'invocationSource', NEW.invocation_source,
      'triggerDetail', NEW.trigger_detail,
      'retryOfRunId', NEW.retry_of_run_id,
      'scheduledRetryAttempt', NEW.scheduled_retry_attempt
    ),
    event_status,
    CASE WHEN event_status <> 'pending' THEN COALESCE(NEW.started_at, now()) END,
    CASE WHEN event_status IN ('dispatched', 'completed', 'cancelled', 'conflict') THEN COALESCE(NEW.started_at, now()) END,
    CASE WHEN event_status IN ('completed', 'cancelled', 'conflict') THEN COALESCE(NEW.finished_at, now()) END,
    NEW.created_at,
    now()
  )
  ON CONFLICT (run_id) WHERE run_id IS NOT NULL DO UPDATE SET
    status = EXCLUDED.status,
    payload = EXCLUDED.payload,
    claimed_at = COALESCE(public.light_execution_events.claimed_at, EXCLUDED.claimed_at),
    dispatched_at = COALESCE(public.light_execution_events.dispatched_at, EXCLUDED.dispatched_at),
    completed_at = COALESCE(public.light_execution_events.completed_at, EXCLUDED.completed_at),
    updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "heartbeat_runs_light_execution_event_insert"
AFTER INSERT ON "heartbeat_runs"
FOR EACH ROW EXECUTE FUNCTION "paperclip_sync_light_execution_event"();
--> statement-breakpoint
CREATE TRIGGER "heartbeat_runs_light_execution_event_status"
AFTER UPDATE OF "status", "started_at", "finished_at" ON "heartbeat_runs"
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.started_at IS DISTINCT FROM NEW.started_at OR OLD.finished_at IS DISTINCT FROM NEW.finished_at)
EXECUTE FUNCTION "paperclip_sync_light_execution_event"();
