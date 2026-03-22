'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import remarkGfm from 'remark-gfm';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTED_QUESTIONS = [
  { label: 'Revenue at risk', q: 'Which segment has the most revenue at risk?' },
  { label: 'Facebook churn', q: 'Why are Facebook customers churning more?' },
  { label: 'Retention plan', q: 'Give me a retention plan for 25-34 year old females' },
  { label: 'Purchase frequency', q: 'What does purchase frequency tell us about churn?' },
  { label: 'Age priority', q: 'Which age group should we prioritize for retention?' },
  { label: 'Email vs Facebook', q: 'Compare Email vs Facebook acquisition quality' },
];

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content:
    "Hi! I'm **ChurnLens**, your AI customer risk analyst.\n\nI have access to your full scoring data — **80,110 customers**, **$6.3M revenue at risk** across 5 traffic sources and 5 age groups.\n\nAsk me anything about churn patterns or retention strategy.",
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(question: string) {
    if (!question.trim() || streaming) return;

    const userMessage: Message = { role: 'user', content: question };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setStreaming(true);
    setMessages([...updatedMessages, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, messages: updatedMessages }),
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              accumulated += parsed.text;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: 'assistant', content: accumulated };
                return next;
              });
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.' };
        return next;
      });
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#F9F7F4]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-stone-200/80 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-stone-900 leading-none">ChurnLens</h1>
            <p className="text-[11px] text-stone-400 mt-0.5 leading-none">AI Customer Risk Analyst</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatBadge color="emerald" icon="users">80K customers</StatBadge>
          <StatBadge color="rose" icon="alert">$6.3M at risk</StatBadge>
          <div className="flex items-center gap-1.5 ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-stone-400 font-medium">Live data</span>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-60 shrink-0 border-r border-stone-200/80 bg-white/60 backdrop-blur-sm hidden sm:flex flex-col gap-1 p-4 overflow-y-auto">
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest px-2 mb-2">
            Quick insights
          </p>
          {SUGGESTED_QUESTIONS.map(({ label, q }) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              disabled={streaming}
              className="group text-left rounded-xl px-3 py-2.5 border border-transparent hover:border-emerald-200 hover:bg-emerald-50/70 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="block text-[11px] font-semibold text-emerald-600 mb-0.5 group-hover:text-emerald-700">
                {label}
              </span>
              <span className="block text-[12px] text-stone-500 leading-snug group-hover:text-stone-600">
                {q}
              </span>
            </button>
          ))}

          <div className="mt-auto pt-4 border-t border-stone-100">
            <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-3">
              <p className="text-[11px] font-semibold text-emerald-700 mb-1">Data connected</p>
              <p className="text-[11px] text-stone-500 leading-relaxed">Supabase · TheLook ecommerce · Live risk scores</p>
            </div>
          </div>
        </aside>

        {/* Chat area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5 shadow-sm">
                    CL
                  </div>
                )}

                <div className={`max-w-[78%] ${msg.role === 'user' ? 'order-1' : ''}`}>
                  {msg.role === 'assistant' ? (
                    <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3.5 shadow-sm border border-stone-100/80 text-[13.5px] text-stone-700 leading-relaxed">
                      {msg.content === '' && streaming ? (
                        <TypingDots />
                      ) : (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={markdownComponents}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      )}
                    </div>
                  ) : (
                    <div className="bg-gradient-to-br from-stone-800 to-stone-900 text-stone-100 rounded-2xl rounded-tr-sm px-4 py-3 text-[13.5px] shadow-sm">
                      {msg.content}
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 text-[10px] font-bold shrink-0 mt-0.5">
                    You
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="px-4 pb-5 pt-3 bg-gradient-to-t from-[#F9F7F4] to-transparent shrink-0">
            <div className="bg-white rounded-2xl border border-stone-200 shadow-md flex items-center gap-2 px-4 py-2.5 focus-within:border-emerald-300 focus-within:shadow-emerald-100/60 focus-within:shadow-lg transition-all duration-200">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                disabled={streaming}
                placeholder="Ask about your churn data..."
                className="flex-1 bg-transparent text-[13.5px] text-stone-800 placeholder:text-stone-400 focus:outline-none disabled:cursor-not-allowed"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={streaming || !input.trim()}
                className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm hover:from-emerald-400 hover:to-teal-500 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {streaming ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-center text-[11px] text-stone-400 mt-2">
              Powered by Claude · Data from Supabase
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex gap-1 items-center h-5 px-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function StatBadge({
  color,
  icon,
  children,
}: {
  color: 'emerald' | 'rose';
  icon: 'users' | 'alert';
  children: React.ReactNode;
}) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  return (
    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${colors[color]}`}>
      {icon === 'users' ? (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )}
      {children}
    </span>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const markdownComponents: any = {
  p: ({ children }: { children: React.ReactNode }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { children: React.ReactNode }) => (
    <ul className="list-none pl-0 mb-3 space-y-1.5">{children}</ul>
  ),
  ol: ({ children }: { children: React.ReactNode }) => (
    <ol className="list-decimal pl-5 mb-3 space-y-1.5">{children}</ol>
  ),
  li: ({ children }: { children: React.ReactNode }) => (
    <li className="flex gap-2 leading-relaxed">
      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
      <span>{children}</span>
    </li>
  ),
  strong: ({ children }: { children: React.ReactNode }) => (
    <strong className="font-semibold text-stone-900">{children}</strong>
  ),
  h2: ({ children }: { children: React.ReactNode }) => (
    <h2 className="font-semibold text-[14px] text-stone-900 mt-4 mb-2 pb-1.5 border-b border-stone-100 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }: { children: React.ReactNode }) => (
    <h3 className="font-semibold text-stone-800 mt-3 mb-1">{children}</h3>
  ),
  table: ({ children }: { children: React.ReactNode }) => (
    <div className="overflow-x-auto my-3 rounded-xl border border-stone-200 shadow-sm">
      <table className="min-w-full text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }: { children: React.ReactNode }) => (
    <thead className="bg-stone-50 text-stone-600 border-b border-stone-200">{children}</thead>
  ),
  tbody: ({ children }: { children: React.ReactNode }) => (
    <tbody className="divide-y divide-stone-100 bg-white">{children}</tbody>
  ),
  tr: ({ children }: { children: React.ReactNode }) => (
    <tr className="hover:bg-stone-50/80 transition-colors">{children}</tr>
  ),
  th: ({ children }: { children: React.ReactNode }) => (
    <th className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap text-[11px] uppercase tracking-wide text-stone-500">
      {children}
    </th>
  ),
  td: ({ children }: { children: React.ReactNode }) => (
    <td className="px-3.5 py-2.5 text-stone-700 whitespace-nowrap">{children}</td>
  ),
  blockquote: ({ children }: { children: React.ReactNode }) => (
    <blockquote className="border-l-[3px] border-emerald-400 pl-3.5 my-3 text-stone-500 italic bg-emerald-50/40 rounded-r-lg py-2 pr-3">
      {children}
    </blockquote>
  ),
  code: ({ children }: { children: React.ReactNode }) => (
    <code className="bg-stone-100 rounded-md px-1.5 py-0.5 text-[12px] font-mono text-stone-700">
      {children}
    </code>
  ),
  hr: () => <hr className="my-4 border-stone-100" />,
};
