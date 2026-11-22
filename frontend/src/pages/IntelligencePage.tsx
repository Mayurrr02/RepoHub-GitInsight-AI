import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  chat,
  getConversations,
  getConversationDetail,
  deleteConversation,
  GroundedCitation,
  ToolExecution,
} from '../api/ai';
import { getMe, getRepositories, Repository } from '../api/repositories';
import { SparklesIcon, ArrowRightIcon, RepositoriesIcon } from '../components/icons/Icons';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: GroundedCitation[];
  tools?: ToolExecution[];
};

const STARTER_PROMPTS = [
  'Explain this repository architecture and modules',
  'Which files handle authentication and security?',
  'What changed in recent commits?',
  'Who are the top contributors and their impact?',
  'Find functions handling database access',
  'What potential engineering risks should we investigate?',
];

export function IntelligencePage() {
  const queryClient = useQueryClient();
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const { data: repos } = useQuery({ queryKey: ['repositories'], queryFn: getRepositories });

  const userName = user?.name || user?.login || 'Developer';

  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content: `Hello ${userName}! 👋 I am your RepoHub Repository Intelligence Assistant.

Select a repository above to explore its codebase, Git history, pull requests, and architecture. I can search source files, inspect commit diffs, and cite exact lines with verified evidence.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-select first repo if available
  useEffect(() => {
    if (repos && repos.length > 0 && selectedRepoId === null) {
      setSelectedRepoId(repos[0].id);
    }
  }, [repos, selectedRepoId]);

  // Load conversations list
  const { data: conversations, refetch: refetchConversations } = useQuery({
    queryKey: ['conversations', selectedRepoId],
    queryFn: () => getConversations(selectedRepoId),
    enabled: true,
  });

  const selectedRepo = repos?.find((r) => r.id === selectedRepoId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Handle switching conversation
  const handleSelectConversation = async (convId: number) => {
    try {
      setIsLoading(true);
      const detail = await getConversationDetail(convId);
      setActiveConversationId(convId);
      setMessages(
        detail.messages.map((m) => ({
          id: `msg-${m.id}`,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          citations: m.grounded_references,
          tools: m.tool_calls || undefined,
        }))
      );
    } catch (err) {
      console.error('Failed to load conversation detail:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: `Started a new thread for ${
          selectedRepo ? selectedRepo.full_name : 'your repositories'
        }. What would you like to inspect?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const handleDeleteConversation = async (e: React.MouseEvent, convId: number) => {
    e.stopPropagation();
    try {
      await deleteConversation(convId);
      if (activeConversationId === convId) {
        handleNewConversation();
      }
      refetchConversations();
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const handleSend = async (questionText?: string) => {
    const text = (questionText || input).trim();
    if (!text || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await chat(text, selectedRepoId, activeConversationId);
      if (res.conversation_id) {
        setActiveConversationId(res.conversation_id);
        refetchConversations();
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: res.answer || 'I could not retrieve an evidence-backed answer.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        citations: res.grounded_references,
        tools: res.tool_executions,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message || 'AI service error.';
      const fallbackMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **AI Intelligence Response:**\n\n${detail}\n\n*Verify that GEMINI_API_KEY is configured in your backend environment.*`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            AI Repository Assistant
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-100 text-purple-700 border border-purple-200 dark:bg-brand-purple/20 dark:text-purple-300 dark:border-purple-500/30">
              Phase 1 Engine
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Revision-aware codebase intelligence, semantic retrieval, and grounded Git insights
          </p>
        </div>

        {/* Repository Context Selector */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
            <RepositoriesIcon className="h-4 w-4 text-brand-purple" />
            <span>Target Repository:</span>
          </label>
          <select
            value={selectedRepoId || ''}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : null;
              setSelectedRepoId(val);
              handleNewConversation();
            }}
            className="rounded-xl border border-slate-300 dark:border-white/[0.1] bg-white dark:bg-[#0D111A] px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 shadow-sm focus:border-brand-purple focus:outline-none"
          >
            <option value="">All Synced Repositories</option>
            {repos?.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.full_name} {repo.is_private ? '(Private)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Workspace: Threads Drawer + Chat Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Threads Sidebar */}
        <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] p-4 shadow-card-light dark:shadow-card-dark space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-white/[0.06]">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Threads
            </h3>
            <button
              onClick={handleNewConversation}
              className="text-[11px] font-semibold text-brand-purple hover:underline cursor-pointer"
            >
              + New Thread
            </button>
          </div>

          <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
            {conversations && conversations.length > 0 ? (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`group flex items-center justify-between rounded-xl px-3 py-2 text-xs transition cursor-pointer ${
                    activeConversationId === conv.id
                      ? 'bg-purple-50 text-brand-purple dark:bg-brand-purple/20 dark:text-purple-300 font-medium'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="truncate max-w-[150px]">{conv.title}</span>
                  <button
                    onClick={(e) => handleDeleteConversation(e, conv.id)}
                    title="Delete thread"
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition px-1"
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">No saved threads yet</div>
            )}
          </div>
        </div>

        {/* Flagship Chat Workspace Card */}
        <div className="lg:col-span-9 rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] p-6 shadow-card-light dark:shadow-card-dark flex flex-col justify-between min-h-[560px] transition-colors">
          {/* Messages Stream */}
          <div className="space-y-5 max-h-[420px] overflow-y-auto pr-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-brand-purple to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-xs dark:shadow-glow-purple">
                    <SparklesIcon className="h-4 w-4" />
                  </div>
                )}

                <div
                  className={`rounded-2xl p-4 max-w-[85%] text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-brand-purple text-white rounded-tr-xs shadow-glow-purple'
                      : 'bg-slate-50 border border-slate-200 text-slate-800 dark:bg-[#080B12] dark:border-white/[0.08] dark:text-slate-200 rounded-tl-xs whitespace-pre-wrap'
                  }`}
                >
                  <div>{msg.content}</div>

                  {/* Tool Execution Badges */}
                  {msg.tools && msg.tools.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-slate-200 dark:border-white/[0.08] flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">
                        Tools Run:
                      </span>
                      {msg.tools.map((t, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded-md bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-500/30 px-2 py-0.5 text-[10px] text-purple-700 dark:text-purple-300 font-mono"
                        >
                          ✓ {t.tool_name} ({t.duration_ms}ms)
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Grounded Source References */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-slate-200 dark:border-white/[0.08] space-y-1">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Grounded References:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.citations.map((c, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white dark:border-white/[0.1] dark:bg-[#121629] px-2 py-1 text-[10px] text-slate-700 dark:text-slate-300 font-mono"
                          >
                            {c.file_path && (
                              <span>
                                📄 {c.file_path}
                                {c.start_line ? `:${c.start_line}-${c.end_line}` : ''}
                              </span>
                            )}
                            {c.commit_sha && <span>🔀 Commit {c.commit_sha.slice(0, 7)}</span>}
                            {c.pr_number && <span>Pull Request #{c.pr_number}</span>}
                            {c.issue_number && <span>Issue #{c.issue_number}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-brand-purple flex items-center justify-center text-white animate-pulse">
                  <SparklesIcon className="h-4 w-4" />
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 dark:bg-[#080B12] dark:border-white/[0.08] px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                  Executing repository tools & generating grounded response...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Starter Suggestion Pills */}
          <div className="my-3 pt-3 border-t border-slate-200 dark:border-white/[0.06]">
            <div className="flex flex-wrap gap-2">
              {STARTER_PROMPTS.map((item) => (
                <button
                  key={item}
                  onClick={() => handleSend(item)}
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 dark:border-white/[0.08] dark:bg-[#080B12] dark:hover:bg-white/[0.08] dark:text-slate-300 dark:hover:text-white px-3 py-1.5 text-xs transition cursor-pointer"
                >
                  <span>💬</span>
                  <span>{item}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Input Bar */}
          <div className="relative flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-[#080B12] px-3.5 py-2 shadow-inner focus-within:border-brand-purple transition-colors">
            <input
              type="text"
              placeholder={`Ask about ${
                selectedRepo ? selectedRepo.name : 'your codebase'
              } (architecture, functions, diffs, bugs)...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
              className="flex-1 bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-purple hover:bg-purple-600 disabled:opacity-40 text-white transition shadow-glow-purple cursor-pointer"
            >
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
