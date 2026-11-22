import { api } from './client';

export type GroundedCitation = {
  file_path?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  commit_sha?: string | null;
  pr_number?: number | null;
  issue_number?: number | null;
  source_type: string;
};

export type ToolExecution = {
  tool_name: string;
  arguments: Record<string, any>;
  result_summary?: string | null;
  duration_ms: number;
};

export type AIChatResponse = {
  answer: string;
  conversation_id: number;
  message_id: number;
  grounded_references: GroundedCitation[];
  tool_executions: ToolExecution[];
};

export type AIConversation = {
  id: number;
  repository_id: number | null;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};

export type AIMessage = {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: any[] | null;
  grounded_references: GroundedCitation[];
  created_at: string;
};

export type AIConversationDetail = {
  conversation: AIConversation;
  messages: AIMessage[];
};

export const chat = (
  question: string,
  repository_id?: number | null,
  conversation_id?: number | null,
  revision?: string | null,
) =>
  api
    .post<AIChatResponse>('/ai/chat', { question, repository_id, conversation_id, revision })
    .then((r) => r.data);

export const getConversations = (repository_id?: number | null) =>
  api
    .get<AIConversation[]>('/ai/conversations', { params: { repository_id } })
    .then((r) => r.data);

export const getConversationDetail = (id: number) =>
  api.get<AIConversationDetail>(`/ai/conversations/${id}`).then((r) => r.data);

export const deleteConversation = (id: number) =>
  api.delete(`/ai/conversations/${id}`);

export const downloadReport = (repository_id?: number | null) =>
  api
    .post('/ai/report', {}, { params: { repository_id }, responseType: 'blob' })
    .then((r) => r.data);
