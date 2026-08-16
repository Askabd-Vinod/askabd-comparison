'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

type Interval = 5 | 10 | 30 | 60;

interface LiveRefreshProps {
  onRefresh: () => void;
  defaultInterval?: Interval;
}

export function LiveRefresh({ onRefresh, defaultInterval = 30 }: LiveRefreshProps) {
  const [interval, setInterval_] = useState<Interval>(defaultInterval);
  const [paused, setPaused] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  const doRefresh = useCallback(() => {
    onRefresh();
    setLastUpdated(new Date());
    setSecondsAgo(0);
  }, [onRefresh]);

  useEffect(() => {
    if (paused) { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = globalThis.setInterval(doRefresh, interval * 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [interval, paused, doRefresh]);

  useEffect(() => {
    tickRef.current = globalThis.setInterval(() => setSecondsAgo(s => s + 1), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  return (
    <div className="flex items-center gap-3 text-[10px] text-gray-500">
      <span className="flex items-center gap-1">
        <span className={`w-1.5 h-1.5 rounded-full ${paused ? 'bg-gray-400' : 'bg-green-500 animate-pulse'}`} />
        {paused ? 'Paused' : 'Live'}
      </span>
      <span>Updated {secondsAgo}s ago</span>
      <select value={interval} onChange={e => setInterval_(Number(e.target.value) as Interval)} className="bg-transparent text-[10px] border-none focus:ring-0 p-0" aria-label="Refresh interval">
        <option value={5}>5s</option><option value={10}>10s</option><option value={30}>30s</option><option value={60}>60s</option>
      </select>
      <button onClick={doRefresh} className="hover:text-purple-600 transition" aria-label="Refresh now">↻</button>
      <button onClick={() => setPaused(!paused)} className="hover:text-purple-600 transition" aria-label={paused ? 'Resume' : 'Pause'}>{paused ? '▶' : '⏸'}</button>
    </div>
  );
}
