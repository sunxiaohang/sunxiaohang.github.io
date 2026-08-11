import { useState, useEffect, useRef } from 'react';
import { StickyNote } from 'lucide-react';
import { useWidgetData } from '@/hooks/useWidgetData';
import type { WidgetProps } from '@/core/registry/types';

interface QuickNoteData { content: string; updatedAt: string; }
const defaultData: QuickNoteData = { content: '', updatedAt: new Date().toISOString() };
const PLACEHOLDERS = ['随便写点什么...', '今天的想法...', '稍后要处理的事情...', '一个突如其来的灵感...'];

export default function QuickNoteWidget({}: WidgetProps) {
  const [data, setData, loading] = useWidgetData<QuickNoteData>('quick-note-main', defaultData);
  const [text, setText] = useState(data.content);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastSavedRef = useRef(data.content);
  const [saved, setSaved] = useState(false);
  const [placeholder] = useState(() => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);

  useEffect(() => {
    if (!loading && data.content !== lastSavedRef.current) {
      setText(data.content); lastSavedRef.current = data.content;
    }
  }, [data.content, loading]);

  const handleChange = (value: string) => {
    setText(value); setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const nd = { content: value, updatedAt: new Date().toISOString() };
      setData(nd); lastSavedRef.current = value;
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    }, 800);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-5 h-5 border-2 border-surface-300 dark:border-white/[0.08] border-t-primary-500 rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col h-full relative">
      {!text && (
        <div className="absolute top-0 left-0 right-0 flex items-center gap-2 pointer-events-none">
          <StickyNote size={16} className="text-surface-300 dark:text-neutral-700" />
          <span className="text-body text-ink-hint dark:text-neutral-600">{placeholder}</span>
        </div>
      )}
      <textarea value={text} onChange={(e) => handleChange(e.target.value)}
        className="flex-1 w-full bg-transparent text-body text-ink-secondary dark:text-neutral-300 placeholder:text-transparent resize-none focus:outline-none leading-relaxed"
        style={{ minHeight: '100%' }} />
      <div className="flex items-center justify-between mt-auto pt-2">
        <div className="text-xs text-ink-hint dark:text-neutral-600 transition-opacity duration-300" style={{ opacity: saved ? 1 : 0 }}>已保存</div>
        {text && <div className="text-xs text-ink-hint dark:text-neutral-600">{text.length} 字</div>}
      </div>
    </div>
  );
}
