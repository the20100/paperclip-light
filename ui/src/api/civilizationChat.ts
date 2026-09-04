import { api } from "./client";

export interface CivilizationModel {
  id: string;
  label: string;
  provider: "codex" | "claude";
  subscription: boolean;
}

export interface CivilizationConversation {
  id: string;
  companyId: string;
  companyName: string;
  companyIssuePrefix: string | null;
  title: string;
  model: string;
  provider: string;
  activityStatus: "working" | "request" | "idle";
  lastMessageRole: "user" | "assistant" | null;
  createdAt: string;
  updatedAt: string;
}

export interface CivilizationMessage {
  id: string;
  role: "user" | "assistant";
  body: string;
  createdAt: string;
}

export const civilizationChatApi = {
  models: () => api.get<{ defaultModel: string; models: CivilizationModel[] }>("/civilization-chat/models"),
  conversations: () => api.get<CivilizationConversation[]>("/civilization-chat/conversations"),
  createConversation: (companyId: string, model: string) =>
    api.post<CivilizationConversation>(
      `/companies/${encodeURIComponent(companyId)}/civilization-chat/conversations`,
      { model },
    ),
  messages: (conversationId: string) =>
    api.get<CivilizationMessage[]>(
      `/civilization-chat/conversations/${encodeURIComponent(conversationId)}/messages`,
    ),
  archiveConversation: (conversationId: string) =>
    api.delete<void>(`/civilization-chat/conversations/${encodeURIComponent(conversationId)}`),
  cancelConversation: (conversationId: string) =>
    api.post<{ cancelled: boolean }>(
      `/civilization-chat/conversations/${encodeURIComponent(conversationId)}/cancel`,
      {},
    ),
  transcribe: (audio: Blob, filename = "architecte-audio.webm") => {
    const form = new FormData();
    form.set("audio", audio, filename);
    return api.postForm<{ text: string }>("/civilization-chat/transcribe", form);
  },
};
