'use client';
import { useState } from 'react';

/**
 * AskABD Design System — Canonical Error State
 *
 * Structure: WHAT HAPPENED / WHY / WHAT YOU CAN DO / technical details
 * (progressively disclosed, collapsed by default). Never shows a secret or a
 * raw stack trace in the primary view — `technicalDetail`, when passed, is
 * expected to already be a safe string (e.g. the API's own sanitized error
 * message), not a raw exception object.
 */
export function ErrorState({
  what,
  why,
  actions,
  technicalDetail,
  onRetry,
}: {
  what: string;
  why?: string;
  actions?: string[];
  technicalDetail?: string;
  onRetry?: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-5">
      <p className="text-sm font-semibold text-red-800">{what}</p>
      {why && <p className="text-xs text-red-600 mt-1">{why}</p>}
      {actions && actions.length > 0 && (
        <ul className="mt-3 space-y-1">
          {actions.map((a, i) => (
            <li key={i} className="text-xs text-red-700 flex items-start gap-1.5">
              <span className="text-red-400 mt-0.5">•</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-3">
        {onRetry && (
          <button onClick={onRetry} className="text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg transition">
            Try Again
          </button>
        )}
        {technicalDetail && (
          <button onClick={() => setShowDetail(s => !s)} className="text-[11px] text-red-500 hover:text-red-700 underline">
            {showDetail ? 'Hide' : 'Show'} technical details
          </button>
        )}
      </div>
      {showDetail && technicalDetail && (
        <pre className="mt-2 text-[10px] text-red-600 bg-red-100/60 rounded p-2 overflow-x-auto whitespace-pre-wrap">{technicalDetail}</pre>
      )}
    </div>
  );
}
