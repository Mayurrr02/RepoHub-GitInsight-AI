import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chat } from '../api/ai';
import { getMe } from '../api/repositories';
import { SparklesIcon, ArrowRightIcon } from '../components/icons/Icons';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

const STARTER_PROMPTS = [
  'Which repository is performing the best?',
  'How can I improve my code review score?',
  'What are my productivity trends?',
  'Summarize my engineering performance',
];

export function IntelligencePage() {
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const userName = user?.name || user?.login || 'Developer';

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content: `Hello ${userName}! 👋 I am your RepoHub AI Engineering Assistant. Ask me anything about your synchronized GitHub repositories, commit velocity, coding streaks, or productivity optimizations.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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
      const res = await chat(text);
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: res.answer || 'I could not generate an answer based on your analytics.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message || 'AI service error.';
      const fallbackMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **AI Intelligence Response:**\n\n${detail}\n\n*Make sure GEMINI_API_KEY is configured in backend environment.*`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            AI Intelligence
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-100 text-purple-700 border border-purple-200 dark:bg-brand-purple/20 dark:text-purple-300 dark:border-purple-500/30">
              Gemini
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ask questions about your engineering activity, code quality, and repository health
          </p>
        </div>
      </div>

      {/* Flagship Chat Workspace Card */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0D111A] p-6 shadow-card-light dark:shadow-card-dark flex flex-col justify-between min-h-[520px] transition-colors">
        {/* Messages Stream */}
        <div className="space-y-4 max-h-[380px] overflow-y-auto pr-2">
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
                {msg.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-brand-purple flex items-center justify-center text-white animate-pulse">
                <SparklesIcon className="h-4 w-4" />
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 dark:bg-[#080B12] dark:border-white/[0.08] px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                Analyzing repository telemetry & generating insights...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Starter Suggestion Pills */}
        <div className="my-4 pt-4 border-t border-slate-200 dark:border-white/[0.06]">
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
            placeholder="Ask anything about your GitHub activity..."
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
  );
}
