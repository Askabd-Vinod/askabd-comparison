'use client';
import { useEffect, useState } from 'react';

function safeParseArray(key: string): unknown[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(key);
  if (!stored) return [];
  try { const parsed = JSON.parse(stored); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

export function NewClientsCount() {
  const [count, setCount] = useState(0);
  useEffect(() => { setCount(safeParseArray('askabd-onboarded-clients').length); }, []);
  if (count === 0) return null;
  return <span className="text-[9px] font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded-full ml-1">+{count} new</span>;
}

export function useNewClientCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => { setCount(safeParseArray('askabd-onboarded-clients').length); }, []);
  return count;
}

export function KpiValueWithNew({ baseValue, label }: { baseValue: number; label?: string }) {
  const [newCount, setNewCount] = useState(0);
  useEffect(() => {
    const clients = safeParseArray('askabd-onboarded-clients');
    if (label === 'healthy' || !label) setNewCount(clients.length);
  }, [label]);
  const total = baseValue + newCount;
  if (newCount === 0) return <>{baseValue}</>;
  return <span className="inline-flex items-center gap-1">{total}<span className="text-[8px] font-medium text-purple-500 bg-purple-50 px-1 py-0.5 rounded">+{newCount}</span></span>;
}
