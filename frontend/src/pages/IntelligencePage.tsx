import { useEffect, useRef, useState } from 'react';
import { chat, downloadReport } from '../api/ai';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

const PRESET_PROMPTS = [
  {
    icon: '🎯',
    title: 'Career & Skills Roadmap',
    description: 'Analyze language strengths and recommend an upskilling roadmap',
    prompt: 'Analyze my top languages and repositories. What are my strongest technical skills, and what is an optimal upskilling roadmap for senior engineering roles?',
  },
  {
    icon: '⚡',
    title: 'Velocity & Streaks Audit',
    description: 'Evaluate coding streaks, commit frequency, and activity patterns',
    prompt: 'Evaluate my coding streak, average commits per day, and weekend activity. How consistent is my output, and what habits can improve my development rhythm?',
  },
  {
    icon: '📄',
    title: 'Resume Bullet Points',
    description: 'Generate 4 high-impact, metric-driven resume achievements',
    prompt: 'Generate 4 high-impact, quantifiable resume bullet points based on my repository health, commit history, and software delivery achievements.',
  },
  {
    icon: '🛠️',
    title: 'Tech Debt & Maintenance',
    description: 'Identify repositories with low documentation or activity',
    prompt: 'Which of my repositories need the most attention in terms of documentation, health score, or maintenance? Provide specific action steps.',
  },
  {
    icon: '🔍',
    title: 'PR & Review Strategy',
    description: 'Advice on peer code reviews and collaboration score',
    prompt: 'Assess my code review score and collaboration activity. What recommendations do you have to improve pull request turnaround and code quality reviews?',
  },
  {
    icon: '👥',
    title: 'Impact & Contributions Summary',
    description: 'High-level synthesis of total software delivery impact',
    prompt: 'Provide an executive summary of my overall engineering impact across all synchronized repositories, projects, and active contributions.',
  },
];

// Helper to format timestamps
function formatTime(date: Date = new Date()): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Markdown formatting helper component
function MarkdownRenderer({ content }: { content: string }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyCode = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Split into blocks by code fences first
  const blocks = content.split(/(```[\s\S]*?```)/g);
  let codeBlockCounter = 0;

  return (
    <div className="space-y-3 text-slate-200 leading-relaxed text-sm">
      {blocks.map((block, bIdx) => {
        if (block.startsWith('```') && block.endsWith('```')) {
          const currentCodeIdx = codeBlockCounter++;
          const lines = block.slice(3, -3).trim().split('\n');
          let language = 'text';
          let code = block.slice(3, -3).trim();

          if (lines.length > 1 && /^[a-zA-Z0-9_-]+$/.test(lines[0].trim())) {
            language = lines[0].trim();
            code = lines.slice(1).join('\n');
          }

          return (
            <div key={bIdx} className="my-3 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-inner font-mono text-xs">
              <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/80 px-3.5 py-1.5 text-slate-400">
                <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">{language}</span>
                <button
                  onClick={() => copyCode(code, currentCodeIdx)}
                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {copiedIndex === currentCodeIdx ? (
                    <>
                      <svg className="h-3.5 w-3.5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3.5 overflow-x-auto text-slate-100 font-mono leading-normal">
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        // Render markdown text lines
        const paragraphs = block.split(/\n\n+/);
        return paragraphs.map((para, pIdx) => {
          if (!para.trim()) return null;

          const lines = para.split('\n');

          // Check if lines are a list
          const isBulletList = lines.every(l => /^\s*[-*•]\s+/.test(l));
          const isNumberList = lines.every(l => /^\s*\d+\.\s+/.test(l));

          if (isBulletList) {
            return (
              <ul key={`${bIdx}-${pIdx}`} className="my-2 space-y-1.5 list-disc list-outside pl-5 text-slate-200">
                {lines.map((l, lIdx) => (
                  <li key={lIdx} className="pl-1">
                    {renderInlineFormatting(l.replace(/^\s*[-*•]\s+/, ''))}
                  </li>
                ))}
              </ul>
            );
          }

          if (isNumberList) {
            return (
              <ol key={`${bIdx}-${pIdx}`} className="my-2 space-y-1.5 list-decimal list-outside pl-5 text-slate-200">
                {lines.map((l, lIdx) => (
                  <li key={lIdx} className="pl-1">
                    {renderInlineFormatting(l.replace(/^\s*\d+\.\s+/, ''))}
                  </li>
                ))}
              </ol>
            );
          }

          // Single paragraph or headers
          return (
            <div key={`${bIdx}-${pIdx}`} className="my-1.5 space-y-1">
              {lines.map((line, lIdx) => {
                if (line.startsWith('### ')) {
                  return (
                    <h3 key={lIdx} className="mt-3 mb-1 text-base font-semibold text-white flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block" />
                      {renderInlineFormatting(line.slice(4))}
                    </h3>
                  );
                }
                if (line.startsWith('## ')) {
                  return (
                    <h2 key={lIdx} className="mt-4 mb-1.5 text-lg font-bold text-slate-100 border-b border-slate-800/80 pb-1">
                      {renderInlineFormatting(line.slice(3))}
                    </h2>
                  );
                }
                if (line.startsWith('# ')) {
                  return (
                    <h1 key={lIdx} className="mt-4 mb-2 text-xl font-bold text-white">
                      {renderInlineFormatting(line.slice(2))}
                    </h1>
                  );
                }
                if (line.startsWith('> ')) {
                  return (
                    <blockquote key={lIdx} className="my-2 border-l-4 border-blue-500/80 bg-blue-950/20 pl-3.5 py-1.5 italic text-slate-300 rounded-r-lg">
                      {renderInlineFormatting(line.slice(2))}
                    </blockquote>
                  );
                }
                return (
                  <p key={lIdx} className="text-slate-200">
                    {renderInlineFormatting(line)}
                  </p>
                );
              })}
            </div>
          );
        });
      })}
    </div>
  );
}

// Inline formatting helper (bold, code pills, italics)
function renderInlineFormatting(text: string) {
  // Regex to split by inline code `code`, bold **text**, and italic *text*
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return tokens.map((token, i) => {
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code key={i} className="rounded bg-slate-800/90 border border-slate-700/60 px-1.5 py-0.5 font-mono text-[12px] text-blue-300">
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={i} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return (
        <em key={i} className="italic text-slate-300">
          {token.slice(1, -1)}
        </em>
      );
    }
    return token;
  });
}

export function IntelligencePage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content:
        '👋 **Hello! I am your RepoHub Engineering Intelligence Assistant.**\n\nI have real-time access to your synchronized GitHub analytics, repositories, commit velocity, code review participation, and developer metrics.\n\nChoose one of the quick analysis templates below or ask me any question about your software engineering habits!',
      timestamp: formatTime(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll chat to latest message
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
      timestamp: formatTime(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await chat(text);
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.answer || 'I could not generate an answer based on your analytics.',
        timestamp: formatTime(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message || 'Failed to generate response.';
      const errorMessage: Message = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Error communicating with AI Service:**\n\n${detail}\n\nPlease verify that your \`GEMINI_API_KEY\` is configured in your environment settings.`,
        timestamp: formatTime(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDownloadReport = async () => {
    setIsDownloadingPdf(true);
    try {
      const blob = await downloadReport();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `repohub-engineering-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF download error:', err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const copyMessageContent = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const clearChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content:
          '👋 **Chat session reset.**\n\nAsk any question about your repositories, code velocity, language distributions, or career recommendations.',
        timestamp: formatTime(),
      },
    ]);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-md shadow-blue-500/20">
              <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2a8 8 0 0 1 8 8c0 3.3-2 6.1-4.8 7.3L15 22H9l-.2-4.7C6 16.1 4 13.3 4 10a8 8 0 0 1 8-8z" />
                <path d="M9 10h6" />
                <path d="M12 7v6" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Engineering Intelligence AI
                <span className="rounded-md bg-blue-950 border border-blue-800 px-2 py-0.5 text-[11px] font-mono font-medium text-blue-400">
                  Gemini Flash 3.5
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Context-aware career advice, skill mapping, tech-debt triage, and commit velocity insights.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition-colors"
            title="Reset conversation"
          >
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Clear Chat</span>
          </button>

          <button
            onClick={handleDownloadReport}
            disabled={isDownloadingPdf}
            className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3.5 py-2 text-xs font-medium text-white shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            {isDownloadingPdf ? (
              <>
                <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download AI PDF Report</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Preset Prompt Cards */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Analysis Templates & Presets</span>
          <span className="text-[11px] text-slate-500">Click any preset to run analysis</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PRESET_PROMPTS.map((item, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(item.prompt)}
              disabled={isLoading}
              className="group flex flex-col text-left rounded-xl border border-slate-800/80 bg-slate-900/60 hover:bg-slate-800/80 hover:border-slate-700 p-3.5 transition-all shadow-sm active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{item.icon}</span>
                <span className="text-xs font-semibold text-slate-200 group-hover:text-blue-400 transition-colors">
                  {item.title}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                {item.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Chat Window */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-2xl flex flex-col overflow-hidden">
        {/* Chat Stream Area */}
        <div className="p-4 sm:p-6 space-y-6 max-h-[600px] min-h-[350px] overflow-y-auto">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 sm:gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20 text-white font-bold text-xs mt-1">
                  AI
                </div>
              )}

              <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[78%]`}>
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-[11px] font-medium text-slate-400">
                    {msg.role === 'user' ? 'You' : 'RepoHub AI'}
                  </span>
                  <span className="text-[10px] text-slate-500">{msg.timestamp}</span>
                </div>

                <div
                  className={`rounded-2xl p-4 sm:p-5 shadow-md ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-slate-950/80 border border-slate-800/80 rounded-tl-sm text-slate-200'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                  ) : (
                    <MarkdownRenderer content={msg.content} />
                  )}
                </div>

                {msg.role === 'assistant' && (
                  <div className="mt-1.5 flex items-center gap-2 px-1 text-[11px] text-slate-400">
                    <button
                      onClick={() => copyMessageContent(msg.id, msg.content)}
                      className="flex items-center gap-1 hover:text-slate-200 transition-colors"
                    >
                      {copiedMessageId === msg.id ? (
                        <>
                          <svg className="h-3.5 w-3.5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="h-8 w-8 rounded-xl bg-slate-700 flex items-center justify-center shrink-0 text-white font-bold text-xs mt-1">
                  ME
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 sm:gap-4 justify-start items-start">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shrink-0 text-white font-bold text-xs animate-pulse">
                AI
              </div>
              <div className="rounded-2xl rounded-tl-sm border border-slate-800 bg-slate-950/80 p-4 shadow-md flex items-center gap-2 text-slate-400 text-xs">
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="ml-2 font-mono text-[11px] text-slate-400">Analyzing GitHub analytics context...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="border-t border-slate-800 bg-slate-950/70 p-4">
          <div className="relative flex items-end gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2.5 focus-within:border-blue-500 transition-colors shadow-inner">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask RepoHub AI anything about your code, productivity, skills, or repositories... (Enter to send, Shift+Enter for new line)"
              rows={2}
              className="flex-1 resize-none bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none leading-relaxed"
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-500/20 shrink-0 cursor-pointer"
              title="Send message"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 px-1">
            <span>RepoHub AI uses Gemini 3.5 Flash with your synchronized repository context.</span>
            <span>Shift + Enter for new line</span>
          </div>
        </div>
      </div>
    </div>
  );
}

