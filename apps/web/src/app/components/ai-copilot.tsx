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
  'Explain the database connection pool issue',
  'Generate RCA for the hydration error',
  'What are the most impacted systems?',
  'Search knowledge base for memory leaks',
  'Compare with historical incidents',
  'Generate executive summary for defect DEF-001',
  'Suggest best practices for connection pooling',
  'What is the business impact of the auth race condition?',
];

/**
 * AskABD AI Engineering Copilot
 * Supports: Explain, Generate RCA, Generate Solutions, Search KB, Compare, Suggest
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
      <button onClick={() => setOpen(true)} className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-purple-600 to-indigo-700 rounded-full shadow-xl flex items-center justify-center hover:scale-105 transition-transform" title="AskABD AI Copilot">
        <span className="text-white text-xl">🤖</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 h-[540px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <div>
            <p className="text-sm font-semibold text-white">AskABD Copilot</p>
            <p className="text-[9px] text-purple-200">Engineering Intelligence Assistant</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white text-lg">✕</button>
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
          <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Ask about errors, RCA, solutions…" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <button onClick={() => sendMessage()} disabled={!input.trim()} className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-3 py-2 rounded-lg text-xs font-medium transition">Send</button>
        </div>
      </div>
    </div>
  );
}

function generateResponse(query: string): CopilotMessage {
  const q = query.toLowerCase();
  let content = '';
  let evidence: string[] = [];
  let confidence = 85;

  if (q.includes('explain') && q.includes('pool')) {
    content = `The database connection pool exhaustion is caused by a missing 'await' in the connection release handler.\n\nWhen queries timeout, the connection is not returned to the pool. Under normal load (~47 concurrent connections), this depletes the pool within 5 minutes.\n\nRoot Cause: Missing await in async connection release handler in src/db/pool.ts\nImpact: Trading operations blocked for 150+ users\nConfidence: 87%`;
    evidence = ['Pool utilization at 100%', 'ORM query timeout handler missing await', 'Historical: INC-034 same pattern'];
    confidence = 87;
  } else if (q.includes('rca') || q.includes('root cause')) {
    content = `Root Cause Analysis:\n\n1. Primary: Connection leak in ORM async handler (87% confidence)\n2. Alternative: Traffic spike exceeding capacity (25%)\n3. Alternative: Database server latency (15%)\n\nEvidence supports primary cause — async/await pattern violation in connection release path. Same pattern observed in INC-034 (3 months ago).`;
    evidence = ['Stack trace analysis', 'Connection pool metrics', 'Historical pattern match'];
    confidence = 87;
  } else if (q.includes('impacted') || q.includes('impact')) {
    content = `Most Impacted Systems:\n\n1. Trading Portal — 3 defects (pool exhaustion, memory leak)\n2. Fleet Tracker — 2 defects (auth race condition)\n3. Patient Portal — 1 defect (hydration mismatch)\n4. Warehouse Manager — 1 defect (OOM kills)\n\nBusiness Impact:\n• Trading: $45K/hour revenue at risk\n• Healthcare: 15% user experience degraded\n• Logistics: Order processing delayed`;
    evidence = ['Defect database correlation', 'Business impact assessment', 'Client SLA analysis'];
    confidence = 92;
  } else if (q.includes('knowledge') || q.includes('search')) {
    content = `Knowledge Base Search Results:\n\n1. "Connection pool exhaustion" — Reused 4× (TTR: 3.5h)\n   Fix: Add timeout + fix async handler\n\n2. "JWT token refresh race condition" — Reused 6× (TTR: 5h)\n   Fix: Redis SETNX mutex\n\n3. "Kubernetes OOM kills" — Reused 3× (TTR: 6h)\n   Fix: Cleanup event listeners + increase memory\n\nAll solutions include validation and rollback plans.`;
    evidence = ['Knowledge base query', '4 matching entries found'];
    confidence = 95;
  } else if (q.includes('executive') || q.includes('summary')) {
    content = `Executive Summary:\n\nEngineering Health: 89% (Build: 96%, Deploy: 88%, Code: 82%)\n\n5 open defects across 4 client systems. 2 critical requiring immediate attention.\n\nKey Actions Required:\n1. Fix connection pool (Meridian Financial) — Critical\n2. Resolve K8s OOM (Atlas Logistics) — Critical\n3. Address hydration error (Nexus Healthcare) — High\n\nMTTR: 4.2 hours | Knowledge reuse: 4 resolutions applied\nAutomation candidates: 12 defects eligible for auto-fix`;
    confidence = 90;
  } else if (q.includes('best practice') || q.includes('suggest')) {
    content = `Best Practices for Connection Pooling:\n\n1. Always set explicit connection timeout (default: 30s)\n2. Implement connection health checks on acquire\n3. Use pool.on('remove') for cleanup tracking\n4. Set maximum pool size based on: (cores × 2) + disk spindles\n5. Implement circuit breaker pattern for pool exhaustion\n6. Monitor pool utilization — alert at 70%\n7. Never hold connections across async boundaries without tracking\n8. Use connection pool middleware for automatic release`;
    evidence = ['PostgreSQL documentation', 'Node.js best practices', 'Previous resolution KB-001'];
    confidence = 95;
  } else {
    content = `I can help with:\n\n• Explain errors and stack traces\n• Generate root cause analysis\n• Search knowledge base for similar issues\n• Compare with historical incidents\n• Generate executive summaries\n• Suggest best practices\n• Assess business impact\n\nPlease provide more context about what you'd like to investigate.`;
    confidence = 100;
  }

  return { id: `msg-${Date.now()}`, role: 'assistant', content, timestamp: new Date().toISOString(), evidence: evidence.length > 0 ? evidence : undefined, confidence };
}
