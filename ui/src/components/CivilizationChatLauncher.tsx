import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Bot,
  Boxes,
  Building2,
  ChevronLeft,
  CircleStop,
  FileText,
  Hash,
  History,
  ImagePlus,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  Mic,
  Minimize2,
  Orbit,
  Radio,
  Send,
  Settings2,
  Sparkles,
  UserRoundCog,
  X,
} from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { agentsApi } from "../api/agents";
import { civilizationChatApi, type CivilizationMessage } from "../api/civilizationChat";
import { companySkillsApi } from "../api/companySkills";
import { instanceSettingsApi } from "../api/instanceSettings";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { MarkdownBody } from "./MarkdownBody";
import { resolveCivilizationChatHref } from "../lib/civilization-chat-links";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";

const DEFAULT_MODEL = "gpt-5.6-sol";
const MAX_PARALLEL_ARCHITECT_RUNS = 3;
const LOADING_GRID_CELLS = Array.from({ length: 9 }, (_, index) => index);

type Mention = {
  id: string;
  kind: "company" | "project" | "agent" | "skill" | "task";
  label: string;
  detail?: string;
};

type ResolvedMention = Mention & { token: string };

type ChatAttachment = {
  clientId: string;
  attachmentId: string | null;
  name: string;
  contentType: string;
  previewUrl: string | null;
  contentPath: string | null;
  status: "uploading" | "ready" | "error";
};

type ActiveChatRun = {
  startedAt: number;
  statusText: string;
  streamingText: string;
};

type RecordingMode = "dictation" | "voice";

const mentionIcons = {
  company: Building2,
  project: Orbit,
  agent: UserRoundCog,
  skill: Boxes,
  task: Hash,
};

function relativeDate(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1_000));
  if (seconds < 60) return "à l’instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  return `il y a ${months} mois`;
}

function escapeMarkdownLabel(value: string) {
  return value.replace(/([\\\[\]])/g, "\\$1");
}

function isImageAttachment(attachment: Pick<ChatAttachment, "contentType">) {
  return attachment.contentType.startsWith("image/");
}

function chatAttachmentMarkdown(attachment: Pick<ChatAttachment, "name" | "contentPath" | "contentType">) {
  if (!attachment.contentPath) return "";
  return isImageAttachment(attachment)
    ? `![${escapeMarkdownLabel(attachment.name)}](${attachment.contentPath})`
    : `[📎 ${escapeMarkdownLabel(attachment.name)}](${attachment.contentPath}?download=1)`;
}

export function CivilizationChatLauncher() {
  const { selectedCompanyId, selectedCompany, companies } = useCompany();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [activeRuns, setActiveRuns] = useState<Record<string, ActiveChatRun>>({});
  const [errorText, setErrorText] = useState("");
  const [panelSize, setPanelSize] = useState<"standard" | "compact" | "expanded">(() =>
    (localStorage.getItem("paperclip.civilization.panel-size") as "standard" | "compact" | "expanded") || "standard",
  );
  const [model, setModel] = useState(() => localStorage.getItem("paperclip.civilization.model") || DEFAULT_MODEL);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [resolvedMentions, setResolvedMentions] = useState<ResolvedMention[]>([]);
  const [attachedImages, setAttachedImages] = useState<ChatAttachment[]>([]);
  const [recordingMode, setRecordingMode] = useState<RecordingMode | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [readAtByConversation, setReadAtByConversation] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("paperclip.civilization.read-at") ?? "{}"); } catch { return {}; }
  });
  const abortControllersRef = useRef(new Map<string, AbortController>());
  const pendingStartCountRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const conversationCreationRef = useRef<Promise<string> | null>(null);
  const attachedImagesRef = useRef(attachedImages);
  attachedImagesRef.current = attachedImages;
  const panelRef = useRef<HTMLElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const sendRef = useRef<(draft?: string, readReply?: boolean) => Promise<void>>(async () => {});

  const experimental = useQuery({
    queryKey: ["instance", "experimental", "civilization-chat"],
    queryFn: () => instanceSettingsApi.getExperimental(),
  });
  const enabled = experimental.data?.enableConferenceRoomChat === true;

  const conversations = useQuery({
    queryKey: ["civilization-chat", "conversations"],
    queryFn: civilizationChatApi.conversations,
    enabled: enabled && open,
    refetchInterval: open ? 1_000 : false,
  });
  const models = useQuery({
    queryKey: ["civilization-chat", "models"],
    queryFn: civilizationChatApi.models,
    enabled: enabled && open,
  });
  const messages = useQuery({
    queryKey: ["civilization-chat", "messages", conversationId],
    queryFn: () => civilizationChatApi.messages(conversationId!),
    enabled: enabled && open && Boolean(conversationId),
    staleTime: 30_000,
    refetchInterval: conversationId && activeRuns[conversationId] ? false : 5000,
    placeholderData: () => undefined,
  });
  const agents = useQuery({
    queryKey: ["civilization-chat", "agents", selectedCompanyId],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: enabled && open && Boolean(selectedCompanyId),
  });
  const projects = useQuery({
    queryKey: ["civilization-chat", "projects", selectedCompanyId],
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: enabled && open && Boolean(selectedCompanyId),
  });
  const mentionQuery = /(?:^|\s)@([^\s@]*)$/.exec(input)?.[1]?.toLowerCase() ?? null;
  const tasks = useQuery({
    queryKey: ["civilization-chat", "tasks", selectedCompanyId],
    queryFn: () => issuesApi.list(selectedCompanyId!, { limit: 100, sortField: "updated", sortDir: "desc" }),
    enabled: enabled && open && Boolean(selectedCompanyId),
  });
  const taskSearch = useQuery({
    queryKey: ["civilization-chat", "task-search", selectedCompanyId, mentionQuery],
    queryFn: () => issuesApi.list(selectedCompanyId!, {
      q: mentionQuery!,
      limit: 20,
      sortField: "updated",
      sortDir: "desc",
    }),
    enabled: enabled && open && Boolean(selectedCompanyId) && Boolean(mentionQuery && mentionQuery.length >= 2),
    staleTime: 30_000,
  });
  const skills = useQuery({
    queryKey: ["civilization-chat", "skills", selectedCompanyId],
    queryFn: () => companySkillsApi.list(selectedCompanyId!),
    enabled: enabled && open && Boolean(selectedCompanyId),
  });

  useEffect(() => {
    if (!open || conversationId || !conversations.data?.length) return;
    setConversationId(conversations.data[0]!.id);
  }, [conversationId, conversations.data, open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: conversationId && activeRuns[conversationId] ? "smooth" : "auto",
      block: "end",
    });
  }, [activeRuns, conversationId, messages.data]);

  useEffect(() => {
    if (Object.keys(activeRuns).length === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [activeRuns]);

  useEffect(() => () => {
    for (const image of attachedImagesRef.current) {
      if (image.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(image.previewUrl);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const mobile = window.matchMedia("(max-width: 47.999rem)");
    let releaseMobileLock = () => {};

    const updateForViewport = () => {
      releaseMobileLock();
      releaseMobileLock = () => {};
      if (!mobile.matches) return;

      const panel = panelRef.current;
      const main = document.getElementById("main-content");
      const previous = {
        documentOverflow: document.documentElement.style.overflow,
        bodyOverflow: document.body.style.overflow,
        mainOverflow: main?.style.overflow ?? "",
        mainOverscrollBehavior: main?.style.overscrollBehavior ?? "",
      };
      const syncVisualViewport = () => {
        const viewport = window.visualViewport;
        panel?.style.setProperty("--sz-architect-visual-viewport-height", `${Math.round(viewport?.height ?? window.innerHeight)}px`);
        panel?.style.setProperty("--sz-architect-visual-viewport-offset-top", `${Math.round(viewport?.offsetTop ?? 0)}px`);
      };
      const preventBackgroundScroll = (event: Event) => {
        if (panel && !panel.contains(event.target as Node)) event.preventDefault();
      };

      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      if (main) {
        main.style.overflow = "hidden";
        main.style.overscrollBehavior = "none";
      }
      syncVisualViewport();
      const viewport = window.visualViewport;
      viewport?.addEventListener("resize", syncVisualViewport);
      viewport?.addEventListener("scroll", syncVisualViewport);
      window.addEventListener("resize", syncVisualViewport);
      document.addEventListener("touchmove", preventBackgroundScroll, { capture: true, passive: false });
      document.addEventListener("wheel", preventBackgroundScroll, { capture: true, passive: false });

      releaseMobileLock = () => {
        document.documentElement.style.overflow = previous.documentOverflow;
        document.body.style.overflow = previous.bodyOverflow;
        if (main) {
          main.style.overflow = previous.mainOverflow;
          main.style.overscrollBehavior = previous.mainOverscrollBehavior;
        }
        viewport?.removeEventListener("resize", syncVisualViewport);
        viewport?.removeEventListener("scroll", syncVisualViewport);
        window.removeEventListener("resize", syncVisualViewport);
        document.removeEventListener("touchmove", preventBackgroundScroll, true);
        document.removeEventListener("wheel", preventBackgroundScroll, true);
      };
    };

    updateForViewport();
    mobile.addEventListener("change", updateForViewport);
    return () => {
      mobile.removeEventListener("change", updateForViewport);
      releaseMobileLock();
    };
  }, [open]);

  useEffect(() => () => {
    recorderRef.current?.stop();
    for (const track of recordingStreamRef.current?.getTracks() ?? []) track.stop();
  }, []);

  const mentionTasks = useMemo(() => {
    const byId = new Map((tasks.data ?? []).map((task) => [task.id, task]));
    for (const task of taskSearch.data ?? []) byId.set(task.id, task);
    return [...byId.values()];
  }, [taskSearch.data, tasks.data]);

  const activeConversation = useMemo(
    () => (conversations.data ?? []).find((conversation) => conversation.id === conversationId) ?? null,
    [conversationId, conversations.data],
  );
  const activeCompanyId = activeConversation?.companyId ?? selectedCompanyId;
  const activeRun = conversationId ? activeRuns[conversationId] : undefined;
  const activeRunCount = Object.keys(activeRuns).length;
  const otherRunCount = activeRunCount - (activeRun ? 1 : 0);

  useEffect(() => {
    if (!conversationId || !messages.data?.length || !activeConversation) return;
    const next = { ...readAtByConversation, [conversationId]: activeConversation.updatedAt };
    setReadAtByConversation(next);
    localStorage.setItem("paperclip.civilization.read-at", JSON.stringify(next));
  // The active conversation is deliberately marked as read once its messages are visible.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages.data, activeConversation?.updatedAt]);

  const allMentions = useMemo<Mention[]>(() => [
    ...companies.map((company) => ({ id: company.id, kind: "company" as const, label: company.name, detail: company.issuePrefix })),
    ...(projects.data ?? []).map((project) => ({ id: project.id, kind: "project" as const, label: project.name })),
    ...(agents.data ?? []).filter((agent) => agent.status !== "terminated").map((agent) => ({
      id: agent.id, kind: "agent" as const, label: agent.name, detail: agent.title ?? agent.role,
    })),
    ...(skills.data ?? []).map((skill) => ({
      id: skill.id, kind: "skill" as const, label: skill.name, detail: skill.slug,
    })),
    ...mentionTasks.map((task) => ({
      id: task.id, kind: "task" as const, label: task.title, detail: task.identifier ?? undefined,
    })),
  ], [agents.data, companies, mentionTasks, projects.data, skills.data]);

  const filteredMentions = useMemo(() => {
    if (mentionQuery === null) return [];
    return allMentions.filter((mention) => {
      const haystack = `${mention.kind} ${mention.label} ${mention.detail ?? ""}`.toLowerCase();
      return !mentionQuery || haystack.includes(mentionQuery);
    }).slice(0, 9);
  }, [allMentions, mentionQuery]);

  useEffect(() => setMentionIndex(0), [mentionQuery]);

  const insertMention = useCallback((mention: Mention) => {
    const token = mention.kind === "task" && mention.detail ? `@${mention.detail}` : `@${mention.label}`;
    setInput((current) => current.replace(/@([^\s@]*)$/, `${token} `));
    setResolvedMentions((current) => [
      ...current.filter((item) => !(item.kind === mention.kind && item.id === mention.id)),
      { ...mention, token },
    ]);
  }, []);

  const ensureConversation = useCallback(async () => {
    if (conversationId) return conversationId;
    if (!selectedCompanyId) throw new Error("Sélectionnez une entreprise");
    if (!conversationCreationRef.current) {
      conversationCreationRef.current = civilizationChatApi.createConversation(selectedCompanyId, model)
        .then(async (created) => {
          setConversationId(created.id);
          await queryClient.invalidateQueries({
            queryKey: ["civilization-chat", "conversations"],
          });
          return created.id;
        })
        .finally(() => {
          conversationCreationRef.current = null;
        });
    }
    return conversationCreationRef.current;
  }, [conversationId, model, queryClient, selectedCompanyId]);

  const attachFiles = useCallback(async (incoming: File[]) => {
    if (!activeCompanyId) return;
    const available = Math.max(0, 6 - attachedImages.length);
    const files = incoming.filter((file) => file.size > 0).slice(0, available);
    if (files.length === 0) {
      setErrorText(available === 0 ? "Maximum 6 fichiers par message" : "Sélectionnez un fichier non vide");
      return;
    }
    setErrorText("");
    const pending = files.map<ChatAttachment>((file, index) => ({
      clientId: `${Date.now()}-${index}-${file.name}`,
      attachmentId: null,
      name: file.name || `fichier-${index + 1}`,
      contentType: file.type || "application/octet-stream",
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      contentPath: null,
      status: "uploading",
    }));
    setAttachedImages((current) => [...current, ...pending]);
    try {
      const activeConversationId = await ensureConversation();
      await Promise.all(files.map(async (file, index) => {
        try {
          const uploaded = await issuesApi.uploadAttachment(activeCompanyId, activeConversationId, file);
          setAttachedImages((current) => current.map((image) => image.clientId === pending[index]!.clientId
            ? {
                ...image,
                attachmentId: uploaded.id,
                name: uploaded.originalFilename ?? image.name,
                contentType: uploaded.contentType ?? image.contentType,
                contentPath: uploaded.contentPath ?? `/api/attachments/${uploaded.id}/content`,
                status: "ready",
              }
            : image));
        } catch {
          setAttachedImages((current) => current.map((image) => image.clientId === pending[index]!.clientId
            ? { ...image, status: "error" }
            : image));
        }
      }));
    } catch (error) {
      setAttachedImages((current) => current.map((image) => pending.some((item) => item.clientId === image.clientId)
        ? { ...image, status: "error" }
        : image));
      setErrorText((error as Error).message);
    }
  }, [activeCompanyId, attachedImages.length, ensureConversation]);

  const removeAttachment = useCallback((clientId: string) => {
    setAttachedImages((current) => {
      const removed = current.find((image) => image.clientId === clientId);
      if (removed?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((image) => image.clientId !== clientId);
    });
  }, []);

  const startNewConversation = useCallback(async () => {
    if (!selectedCompanyId) return;
    const created = await civilizationChatApi.createConversation(selectedCompanyId, model);
    await queryClient.invalidateQueries({ queryKey: ["civilization-chat", "conversations"] });
    setConversationId(created.id);
    setHistoryOpen(false);
    setInput("");
    setResolvedMentions([]);
    setAttachedImages((current) => {
      for (const image of current) if (image.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(image.previewUrl);
      return [];
    });
    setErrorText("");
  }, [model, queryClient, selectedCompanyId]);

  const archiveConversation = useCallback(async (targetConversationId = conversationId) => {
    if (!targetConversationId || activeRuns[targetConversationId]) return;
    try {
      await civilizationChatApi.archiveConversation(targetConversationId);
      await queryClient.invalidateQueries({ queryKey: ["civilization-chat", "conversations"] });
      setConversationId(null);
      setHistoryOpen(true);
    } catch (error) {
      setErrorText((error as Error).message);
    }
  }, [activeRuns, conversationId, queryClient]);

  const stop = useCallback((targetConversationId = conversationId) => {
    if (!targetConversationId) return;
    abortControllersRef.current.get(targetConversationId)?.abort();
    abortControllersRef.current.delete(targetConversationId);
    setActiveRuns((current) => {
      const { [targetConversationId]: _, ...remaining } = current;
      return remaining;
    });
    void civilizationChatApi.cancelConversation(targetConversationId)
      .then(() => queryClient.invalidateQueries({ queryKey: ["civilization-chat", "conversations"] }))
      .catch((error: Error) => setErrorText(error.message));
  }, [conversationId, queryClient]);

  const send = useCallback(async (draft?: string, readReply = false) => {
    const message = (draft ?? input).trim();
    const readyAttachments = attachedImages.filter((attachment) => attachment.status === "ready" && attachment.attachmentId && attachment.contentPath);
    const attachmentUploadBlocked = attachedImages.some((attachment) => attachment.status !== "ready");
    if (
      (!message && readyAttachments.length === 0)
      || attachmentUploadBlocked
      || !activeCompanyId
      || (conversationId && activeRuns[conversationId])
      || activeRunCount + pendingStartCountRef.current >= MAX_PARALLEL_ARCHITECT_RUNS
    ) return;
    const targetCompanyId = activeCompanyId;
    const mentions = resolvedMentions
      .filter((mention) => message.includes(mention.token))
      .map(({ id, kind, label, detail }) => ({ id, kind, label, detail }));
    pendingStartCountRef.current += 1;
    setInput("");
    setResolvedMentions([]);
    for (const attachment of readyAttachments) if (attachment.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(attachment.previewUrl);
    setAttachedImages([]);
    setErrorText("");
    const attachmentMarkdown = readyAttachments
      .map(chatAttachmentMarkdown)
      .join("\n");
    const optimistic: CivilizationMessage = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      body: [message, attachmentMarkdown].filter(Boolean).join("\n\n"),
      createdAt: new Date().toISOString(),
    };
    let activeConversationId: string | null = conversationId;
    let controller: AbortController | null = null;
    try {
      if (!activeConversationId) {
        const created = await civilizationChatApi.createConversation(targetCompanyId, model);
        activeConversationId = created.id;
        setConversationId(created.id);
        await queryClient.invalidateQueries({ queryKey: ["civilization-chat", "conversations"] });
      }
      const targetConversationId = activeConversationId;
      const startedAt = Date.now();
      controller = new AbortController();
      abortControllersRef.current.set(targetConversationId, controller);
      setActiveRuns((current) => ({
        ...current,
        [targetConversationId]: { startedAt, statusText: "Connexion à l’Architecte…", streamingText: "" },
      }));
      queryClient.setQueryData<typeof conversations.data>(["civilization-chat", "conversations"], (current) => current?.map((conversation) =>
        conversation.id === targetConversationId
          ? { ...conversation, activityStatus: "working", updatedAt: new Date().toISOString() }
          : conversation,
      ));
      queryClient.setQueryData<CivilizationMessage[]>(
        ["civilization-chat", "messages", targetConversationId],
        (current = []) => [...current, optimistic],
      );
      const response = await fetch("/api/civilization-chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyId: targetCompanyId,
          conversationId: targetConversationId,
          model,
          message,
          mentions,
          attachmentIds: readyAttachments.map((attachment) => attachment.attachmentId),
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "L’Architecte est indisponible");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === "status") {
            setActiveRuns((current) => current[targetConversationId]
              ? { ...current, [targetConversationId]: { ...current[targetConversationId], statusText: event.text } }
              : current);
          } else if (event.type === "chunk") {
            accumulated += event.text;
            setActiveRuns((current) => current[targetConversationId]
              ? {
                  ...current,
                  [targetConversationId]: { ...current[targetConversationId], streamingText: accumulated, statusText: "" },
                }
              : current);
          } else if (event.type === "error") {
            setErrorText(event.message);
          }
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["civilization-chat", "conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["civilization-chat", "messages"] }),
      ]);
      if (readReply && accumulated && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(accumulated);
        utterance.lang = "fr-FR";
        window.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") setErrorText((error as Error).message);
    } finally {
      pendingStartCountRef.current -= 1;
      if (activeConversationId) {
        const completedConversationId = activeConversationId;
        abortControllersRef.current.delete(completedConversationId);
        setActiveRuns((current) => {
          const { [completedConversationId]: _, ...remaining } = current;
          return remaining;
        });
      }
    }
  }, [activeCompanyId, activeRunCount, activeRuns, attachedImages, conversationId, input, model, queryClient, resolvedMentions]);

  sendRef.current = send;

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const startRecording = useCallback(async (mode: RecordingMode) => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErrorText("La dictée vocale n’est pas prise en charge par ce navigateur");
      return;
    }
    if (recordingMode) {
      stopRecording();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => setErrorText("L’enregistrement vocal a échoué");
      recorder.onstop = () => {
        recorderRef.current = null;
        for (const track of stream.getTracks()) track.stop();
        recordingStreamRef.current = null;
        setRecordingMode(null);
        const audio = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (audio.size === 0) return;
        setTranscribing(true);
        void civilizationChatApi.transcribe(audio).then(async ({ text }) => {
          if (mode === "voice") await sendRef.current(text, true);
          else setInput((current) => current ? `${current} ${text}` : text);
        }).catch((error: Error) => {
          setErrorText(error.message);
        }).finally(() => {
          setTranscribing(false);
        });
      };
      setErrorText("");
      setRecordingMode(mode);
      recorder.start();
    } catch (error) {
      setErrorText(error instanceof DOMException && error.name === "NotAllowedError"
        ? "Autorisez le microphone pour utiliser la dictée vocale"
        : "Impossible d’accéder au microphone");
    }
  }, [recordingMode, stopRecording]);

  if (!enabled || !selectedCompanyId) return null;

  const currentModel = models.data?.models.find((entry) => entry.id === model);
  const renderedMessages = messages.data ?? [];
  const elapsedTenths = activeRun ? Math.max(0, Math.floor((now - activeRun.startedAt) / 100)) : 0;
  const loadingElapsed = elapsedTenths < 600
    ? `${(elapsedTenths / 10).toFixed(1)}s`
    : `${Math.floor(elapsedTenths / 600)}m ${((elapsedTenths % 600) / 10).toFixed(1)}s`;
  const conversationSignal = (conversation: NonNullable<typeof conversations.data>[number]) => {
    if (conversation.activityStatus === "working") return "working";
    if (conversation.activityStatus === "request") return "request";
    const readAt = readAtByConversation[conversation.id];
    return conversation.lastMessageRole === "assistant" && (!readAt || new Date(conversation.updatedAt) > new Date(readAt))
      ? "unread" : "idle";
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group fixed bottom-5 right-5 z-(--z-architect) grid h-14 w-14 place-items-center rounded-full border border-primary/25 bg-primary text-primary-foreground shadow-xl transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Ouvrir l’Architecte de civilisation"
        >
          <Orbit className="h-6 w-6 transition-transform group-hover:rotate-12" />
          <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-background bg-secondary" />
        </button>
      )}

      {open && (
        <section
          ref={panelRef}
          aria-label="Chat avec l’Architecte de civilisation"
          data-panel-size={panelSize}
          className="civilization-chat-panel fixed inset-0 z-(--z-architect) flex h-dvh overflow-hidden border border-border bg-background shadow-2xl md:inset-auto md:bottom-5 md:right-5 md:h-auto md:rounded-xl"
        >
          <aside className={cn(
            "civilization-chat-history flex w-full shrink-0 flex-col border-r border-border bg-background md:w-(--sz-architect-history) md:bg-muted/35",
            historyOpen ? "absolute inset-0 z-20 md:static" : "hidden md:flex",
          )}>
            <div className="flex items-center justify-between px-3 py-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversations</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setHistoryOpen(false)} className="md:hidden">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
            <div className="px-2">
              <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={startNewConversation}>
                <MessageSquarePlus className="h-4 w-4" /> Nouvelle conversation
              </Button>
            </div>
            <div className="civilization-chat-history-list mt-3 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-3">
              {(conversations.data ?? []).map((conversation) => (
                <div key={conversation.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                    setConversationId(conversation.id);
                    setHistoryOpen(false);
                    setAttachedImages((current) => {
                      for (const image of current) {
                        if (image.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(image.previewUrl);
                      }
                      return [];
                    });
                  }}
                    className={cn(
                    "flex w-full flex-col gap-1 rounded-md px-3 py-2 pr-8 text-left transition-colors",
                    conversation.id === conversationId ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                  )}
                >
                  <span className="flex items-start gap-2"><span className={cn("civilization-chat-status-dot", `civilization-chat-status-dot--${conversationSignal(conversation)}`)} aria-label={conversationSignal(conversation)} /><span className="line-clamp-2 text-sm font-medium">{conversation.title}</span></span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="truncate rounded-full bg-secondary px-1.5 py-0.5 text-secondary-foreground">{conversation.companyIssuePrefix ?? conversation.companyName}</span>
                    <span>{relativeDate(conversation.updatedAt)}</span>
                  </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => { void archiveConversation(conversation.id); }}
                    disabled={conversation.activityStatus === "working" || Boolean(activeRuns[conversation.id])}
                    className="absolute right-1 top-1 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    aria-label={`Archiver ${conversation.title}`}
                    title="Archiver la conversation"
                  ><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="civilization-chat-header flex shrink-0 items-center gap-2 border-b border-border px-3 py-3 md:gap-3 md:px-4">
              <Button variant="ghost" size="icon-sm" onClick={() => setHistoryOpen((value) => !value)} aria-label="Historique">
                <History className="h-4 w-4" />
              </Button>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
                <Orbit className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-semibold">Architecte de civilisation</h2>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">omniscient</span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{activeConversation?.companyName ?? selectedCompany?.name} · Paperclip + VPS</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  const next = panelSize === "expanded" ? "compact" : "expanded";
                  setPanelSize(next);
                  localStorage.setItem("paperclip.civilization.panel-size", next);
                }}
                aria-label={panelSize === "expanded" ? "Réduire la fenêtre" : "Agrandir la fenêtre"}
                title={panelSize === "expanded" ? "Réduire la fenêtre" : "Agrandir la fenêtre"}
                className="hidden md:inline-flex"
              >
                {panelSize === "expanded" ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => void archiveConversation()} disabled={!conversationId || Boolean(activeRun)} aria-label="Archiver la conversation" title="Archiver la conversation" className="hidden md:inline-flex">
                <Archive className="h-4 w-4" />
              </Button>
              <div className="relative">
                <Button variant="ghost" size="icon-sm" onClick={() => setSettingsOpen((value) => !value)} aria-label="Paramètres du modèle">
                  <Settings2 className="h-4 w-4" />
                </Button>
                {settingsOpen && (
                  <div className="absolute right-0 top-10 z-30 w-72 rounded-lg border border-border bg-popover p-3 shadow-xl">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Modèle de l’Architecte</div>
                    <div className="flex flex-col gap-1">
                      {(models.data?.models ?? []).map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => {
                            setModel(entry.id);
                            localStorage.setItem("paperclip.civilization.model", entry.id);
                            setSettingsOpen(false);
                          }}
                          className={cn(
                            "flex items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent",
                            entry.id === model && "bg-accent",
                          )}
                        >
                          <span><span className="font-medium">{entry.label}</span><span className="block text-xs text-muted-foreground">{entry.provider} · abonnement</span></span>
                          {entry.id === model && <Sparkles className="h-4 w-4 text-primary" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Fermer">
                <X className="h-4 w-4" />
              </Button>
            </header>

            <div className="civilization-chat-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-7 md:py-5">
              {!conversationId && renderedMessages.length === 0 && (
                <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center">
                  <div className="mb-5 grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary"><Orbit className="h-8 w-8" /></div>
                  <h3 className="text-xl font-semibold">Pilotez votre civilisation d’agents</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Demandez une synthèse, réorganisez des projets ou lancez du travail. Mentionnez une entreprise, un projet, un agent, un skill ou une tâche avec <strong>@</strong>.
                  </p>
                </div>
              )}
              <div className="mx-auto flex max-w-3xl flex-col gap-4 md:gap-5">
                {renderedMessages.map((message) => (
                  <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-(--pct-85) rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      message.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-card",
                    )}>
                      {message.role === "assistant" && <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><Bot className="h-3.5 w-3.5" /> Architecte</div>}
                      <MarkdownBody
                        className={message.role === "user" ? "paperclip-markdown-on-accent" : undefined}
                        issueQuicklookClassName="z-(--z-architect-quicklook)"
                        resolveLinkHref={resolveCivilizationChatHref}
                      >
                        {message.body}
                      </MarkdownBody>
                    </div>
                  </div>
                ))}
                {activeRun && (
                  <div className="civilization-chat-working" role="status" aria-live="polite">
                    <span className="civilization-chat-loading-grid" aria-hidden="true">
                      {LOADING_GRID_CELLS.map((cell) => <span key={cell} />)}
                    </span>
                    <span><strong>{activeRun.statusText || "L’Architecte travaille…"}</strong><small>En cours · {loadingElapsed}</small></span>
                  </div>
                )}
                {activeRun?.streamingText && (
                  <div className="flex justify-start"><div className="max-w-(--pct-85) rounded-xl border border-border bg-card px-4 py-3 text-sm"><MarkdownBody resolveLinkHref={resolveCivilizationChatHref}>{activeRun.streamingText}</MarkdownBody></div></div>
                )}
                {errorText && <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorText}</div>}
                <div ref={endRef} />
              </div>
            </div>

            <footer className="civilization-chat-footer relative shrink-0 border-t border-border bg-background px-3 py-3 md:px-7 md:py-4">
              {otherRunCount > 0 && !activeRun && (
                <div className="mx-auto mb-2 max-w-3xl rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground" role="status">
                  {otherRunCount} session{otherRunCount > 1 ? "s" : ""} de l’Architecte {otherRunCount > 1 ? "continuent" : "continue"} en parallèle. Vous pouvez lancer cette conversation.
                </div>
              )}
              {filteredMentions.length > 0 && (
                <div className="absolute bottom-full left-4 mb-2 w-(--sz-architect-mentions) overflow-hidden rounded-lg border border-border bg-popover shadow-xl md:left-7">
                  {filteredMentions.map((mention, index) => {
                    const Icon = mentionIcons[mention.kind];
                    return (
                      <button
                        key={`${mention.kind}:${mention.id}`}
                        type="button"
                        onMouseDown={(event) => { event.preventDefault(); insertMention(mention); }}
                        className={cn("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent", index === mentionIndex && "bg-accent")}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {mention.kind === "task" && mention.detail ? `${mention.detail} · ` : ""}{mention.label}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {mention.kind === "task" ? "tâche · recherche par ID ou nom" : mention.kind}{mention.kind !== "task" && mention.detail ? ` · ${mention.detail}` : ""}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {attachedImages.length > 0 && (
                <div className="mx-auto mb-2 flex max-w-3xl gap-2 overflow-x-auto pb-1" aria-label="Fichiers joints">
                  {attachedImages.map((attachment) => (
                    <div
                      key={attachment.clientId}
                      className={cn(
                        "group relative grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted",
                        attachment.status === "error" ? "border-destructive" : "border-border",
                      )}
                    >
                      {isImageAttachment(attachment) && attachment.previewUrl ? (
                        <img src={attachment.previewUrl} alt={attachment.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex min-w-0 flex-col items-center gap-1 px-2 text-center text-muted-foreground">
                          <FileText className="h-5 w-5 shrink-0" />
                          <span className="w-full truncate text-xs">{attachment.name}</span>
                        </span>
                      )}
                      {attachment.status === "uploading" && (
                        <span className="absolute inset-0 grid place-items-center bg-background/70">
                          <Loader2 className="h-5 w-5 animate-spin text-foreground" />
                        </span>
                      )}
                      {attachment.status === "error" && (
                        <span className="absolute inset-x-0 bottom-0 bg-destructive px-1 py-0.5 text-center text-xs text-destructive-foreground">
                          Échec
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.clientId)}
                        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-background/90 text-foreground opacity-100 shadow-sm transition-opacity md:opacity-0 md:group-hover:opacity-100"
                        aria-label={`Retirer ${attachment.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="civilization-chat-composer mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-input bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    if (files.length > 0) void attachFiles(files);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={Boolean(activeRun) || attachedImages.length >= 6}
                  aria-label="Joindre des fichiers"
                  title="Joindre des fichiers"
                  className="order-2 shrink-0"
                >
                  <ImagePlus className="h-4 w-4" />
                </Button>
                <textarea
                  value={input}
                  onChange={(event) => {
                    const nextInput = event.target.value;
                    setInput(nextInput);
                    setResolvedMentions((current) => current.filter((mention) => nextInput.includes(mention.token)));
                  }}
                  onKeyDown={(event) => {
                    if (filteredMentions.length > 0 && ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) {
                      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault();
                        setMentionIndex((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + filteredMentions.length) % filteredMentions.length);
                      } else if (event.key === "Enter" || event.key === "Tab") {
                        event.preventDefault();
                        insertMention(filteredMentions[mentionIndex]!);
                      } else if (event.key === "Escape") {
                        setInput((current) => `${current} `);
                      }
                      return;
                    }
                    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
                  }}
                  onPaste={(event) => {
                    const files = Array.from(event.clipboardData.files);
                    if (files.length === 0) return;
                    event.preventDefault();
                    const pastedText = event.clipboardData.getData("text/plain");
                    if (pastedText) setInput((current) => `${current}${pastedText}`);
                    void attachFiles(files);
                  }}
                  placeholder="Orchestrez Paperclip… Tapez @ pour mentionner"
                  rows={1}
                  disabled={Boolean(activeRun) || transcribing}
                  className="order-1 max-h-40 min-h-12 w-full resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground disabled:opacity-60 md:text-sm"
                />
                <Button
                  type="button"
                  size="icon"
                  variant={recordingMode === "dictation" ? "destructive" : "ghost"}
                  onClick={() => recordingMode ? stopRecording() : void startRecording("dictation")}
                  disabled={Boolean(activeRun) || transcribing}
                  aria-label={recordingMode === "dictation" ? "Arrêter la dictée" : "Dicter un message"}
                  title={recordingMode === "dictation" ? "Arrêter la dictée" : "Dicter un message"}
                  className="order-2 shrink-0"
                >
                  {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant={recordingMode === "voice" ? "destructive" : "secondary"}
                  size="sm"
                  onClick={() => recordingMode ? stopRecording() : void startRecording("voice")}
                  disabled={Boolean(activeRun) || transcribing}
                  aria-label={recordingMode === "voice" ? "Arrêter le mode vocal" : "Parler à l’Architecte"}
                  className="order-2 gap-2 rounded-full px-3"
                >
                  {recordingMode === "voice" ? <CircleStop className="h-4 w-4" /> : <Radio className="h-4 w-4" />}
                  {recordingMode === "voice" ? "Arrêter" : "Parler"}
                </Button>
                <span className="order-2 min-w-0 flex-1 text-xs text-muted-foreground" aria-live="polite">
                  {recordingMode === "dictation" && "Dictée en cours…"}
                  {recordingMode === "voice" && "Mode vocal — cliquez pour envoyer"}
                  {transcribing && "Transcription…"}
                </span>
                {activeRun ? (
                  <Button size="icon" variant="destructive" onClick={() => stop()} aria-label="Arrêter" className="order-2"><CircleStop className="h-4 w-4" /></Button>
                ) : (
                  <Button
                    size="icon"
                    onClick={() => void send()}
                    disabled={
                      (!input.trim() && !attachedImages.some((image) => image.status === "ready")) ||
                      attachedImages.some((image) => image.status !== "ready") ||
                      activeRunCount >= MAX_PARALLEL_ARCHITECT_RUNS
                    }
                    aria-label="Envoyer"
                    className="order-2"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="mx-auto mt-2 flex max-w-3xl items-center justify-between text-xs text-muted-foreground">
                <span>{transcribing ? "Votre message est transcrit de façon sécurisée…" : "Entrée pour envoyer · Maj+Entrée pour une ligne"}</span>
                <span>{currentModel?.label ?? model}</span>
              </div>
            </footer>
          </div>
        </section>
      )}
    </>
  );
}
