import { useState, useEffect } from 'react';
import type { WidgetProps } from '@/core/registry/types';

export default function ClockWidget({}: WidgetProps) {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);

  const h = time.getHours().toString().padStart(2, '0');
  const m = time.getMinutes().toString().padStart(2, '0');
  const s = time.getSeconds().toString().padStart(2, '0');
  const dateStr = time.toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const dayPct = (time.getHours() * 3600 + time.getMinutes() * 60 + time.getSeconds()) / 86400;

  return (
    <div className="flex flex-col items-center justify-center h-full select-none gap-4">
      {/* Progress ring */}
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-surface-200 dark:text-white/[0.04]" strokeWidth="4" />
          <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-primary-500" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${dayPct * 264} 264`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-ink-hint dark:text-neutral-500">今天</span>
          <span className="text-sm font-bold text-ink-secondary dark:text-neutral-300">{Math.round(dayPct * 100)}%</span>
        </div>
      </div>

      {/* Time */}
      <div className="text-center">
        <div className="text-5xl font-bold text-ink dark:text-neutral-100 tracking-tighter tabular-nums leading-none">{h}:{m}</div>
        <div className="text-lg font-medium text-primary-500 mt-1 tabular-nums tracking-widest">{s}</div>
      </div>

      {/* Date */}
      <div className="text-body-sm text-ink-muted dark:text-neutral-400 font-medium">{dateStr}</div>
    </div>
  );
}
