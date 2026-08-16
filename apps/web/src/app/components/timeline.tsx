import Link from 'next/link';

export interface TimelineEvent {
  timestamp: string;
  title: string;
  description?: string;
  type?: 'deployment' | 'incident' | 'alert' | 'audit' | 'change' | 'info';
  href?: string;
}

const typeColors: Record<string, string> = {
  deployment: 'bg-purple-500',
  incident: 'bg-red-500',
  alert: 'bg-orange-500',
  audit: 'bg-blue-500',
  change: 'bg-green-500',
  info: 'bg-gray-400',
};

export function Timeline({ events, title }: { events: TimelineEvent[]; title?: string }) {
  return (
    <section className="bg-white rounded-xl border p-5">
      {title && <h3 className="font-semibold text-sm mb-4">{title}</h3>}
      <div className="relative">
        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-gray-200" />
        <div className="space-y-3">
          {events.map((event, i) => {
            const dot = typeColors[event.type || 'info'];
            const content = (
              <div className="flex items-start gap-3 relative">
                <span className={`w-[11px] h-[11px] rounded-full ${dot} shrink-0 mt-0.5 relative z-10 border-2 border-white`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-800 truncate">{event.title}</p>
                    <span className="text-[10px] text-gray-400 shrink-0 ml-2">{fmtDate(event.timestamp)}</span>
                  </div>
                  {event.description && <p className="text-[11px] text-gray-500 mt-0.5">{event.description}</p>}
                </div>
              </div>
            );
            return event.href ? (
              <Link key={i} href={event.href} className="block hover:bg-gray-50 rounded p-1 -m-1 transition">{content}</Link>
            ) : (
              <div key={i}>{content}</div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}
