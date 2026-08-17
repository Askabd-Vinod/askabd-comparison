'use client';
import { useState } from 'react';

interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  evidence?: string[];
  confidence?: number;
}

const suggestions = [
  'What can this assistant actually do right now?',
  'Where do I find real defect data?',
  'How do I check a client\'s engineering health?',
];

/**
 * AskABD AI Engineering Copilot — placeholder shell.
 *
 * There is no real AI/LLM backend behind this widget yet. It intentionally does not
 * fabricate analysis, confidence scores, or evidence — see `generateResponse()` below for
 * the full history of what this used to do and why it was changed.
 */
export function AICopilot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  function sendMessage(text?: string) {
    const msg = text || input.trim();
    if (!msg) return;

    const userMsg: CopilotMessage = { id: `msg-${Date.now()}`, role: 'user', content: msg, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const response = generateResponse(msg);
      setMessages(prev => [...prev, response]);
      setLoading(false);
    }, 1500);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-purple-600 to-indigo-700 rounded-full shadow-xl flex items-center justify-center hover:scale-105 transition-transform" title="AskABD AI Copilot" aria-label="Open AskABD AI Copilot">
        <span className="text-white text-xl" aria-hidden="true">🤖</span>
      </button>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="AskABD AI Copilot" className="fixed bottom-6 right-6 z-50 w-96 h-[540px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">🤖</span>
          <div>
            <p className="text-sm font-semibold text-white">AskABD Copilot</p>
            <p className="text-[9px] text-purple-200">Engineering Intelligence Assistant</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white text-lg" aria-label="Close AI Copilot">✕</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-4">
            <p className="text-xs text-gray-500 mb-3">How can I help with engineering today?</p>
            <div className="space-y-1.5">
              {suggestions.slice(0, 4).map((s, i) => (
                <button key={i} onClick={() => sendMessage(s)} className="block w-full text-left text-[10px] text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-2 rounded-lg transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 ${msg.role === 'user' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
              <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
              {msg.evidence && msg.evidence.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200/30">
                  <p className="text-[9px] font-medium opacity-70 mb-1">Evidence:</p>
                  {msg.evidence.map((e, i) => <p key={i} className="text-[9px] opacity-70">• {e}</p>)}
                </div>
              )}
              {msg.confidence && <p className="text-[9px] mt-1 opacity-60">Confidence: {msg.confidence}%</p>}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-3 py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex gap-2">
          <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Ask about errors, RCA, solutions…" aria-label="Message AskABD AI Copilot" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <button onClick={() => sendMessage()} disabled={!input.trim()} className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-3 py-2 rounded-lg text-xs font-medium transition">Send</button>
        </div>
      </div>
    </div>
  );
}

/**
 * PREVIOUSLY: every response here was hardcoded, keyword-matched canned text — fabricated
 * root-cause analyses, fabricated confidence percentages (87%, 92%, 95%...) attached to
 * every answer regardless of what was actually asked, a fabricated dollar figure ("$45K/hour
 * revenue at risk"), and references to client names ("Meridian Financial", "Atlas Logistics",
 * "Nexus Healthcare") that do not exist in this database — none of it connected to any real
 * API call, defect record, or engineering data. Found during the final QA/UAT pass: this is
 * exactly the "fake confidence, fabricated evidence" failure mode this whole product is
 * built to argue against, on a widget that floats over every single page.
 *
 * NOW: honest. There is no real AI/LLM backend behind this widget and no real reasoning
 * engine — building one is a genuine product feature, not a QA-pass fix, so it is not
 * invented here. This function says so plainly and points to the one place in the product
 * that DOES have real, evidence-backed engineering data: `/engineering` (backed by
 * `oc_defects`, see `real-engineering.ts`). No fabricated confidence, no fabricated
 * evidence, no invented client names or dollar figures.
 */
function generateResponse(query: string): CopilotMessage {
  const content = `This assistant is not yet connected to a real AI/LLM backend or to live defect data — nothing below would be a computed answer to "${query}", so none is shown.\n\nFor real, evidence-backed engineering data, use:\n• Engineering Intelligence (/engineering) — real defects, severity, and evidence from this database\n• A specific client's Engineering page — defects scoped to that client\n\nThis widget will show real analysis here once it is wired to an actual backend.`;
  return { id: `msg-${Date.now()}`, role: 'assistant', content, timestamp: new Date().toISOString() };
}
