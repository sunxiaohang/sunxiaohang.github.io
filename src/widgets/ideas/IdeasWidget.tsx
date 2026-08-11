import { useState, useMemo } from 'react';
import { Plus, Trash2, X, ChevronLeft, Lightbulb, Sparkles } from 'lucide-react';
import { useWidgetData } from '@/hooks/useWidgetData';
import { nanoid, formatDate } from '@/lib/utils';
import type { WidgetProps } from '@/core/registry/types';
import type { IdeaNote, IdeasData } from './types';

const defaultData: IdeasData = { notes: [], tags: [] };

export default function IdeasWidget({}: WidgetProps) {
  const [data, setData, loading] = useWidgetData<IdeasData>('ideas-main', defaultData);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const sorted = useMemo(() => [...data.notes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [data.notes]);
  const selected = useMemo(() => selectedId ? data.notes.find((n) => n.id === selectedId) : null, [selectedId, data.notes]);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-5 h-5 border-2 border-surface-300 dark:border-white/[0.08] border-t-primary-500 rounded-full animate-spin" /></div>;

  if (selected) {
    return (
      <IdeaDetail note={selected}
        onSave={(u) => setData({ notes: data.notes.map((n) => (n.id === u.id ? u : n)), tags: [...new Set([...data.tags, ...u.tags])] })}
        onDelete={(id) => { setData({ ...data, notes: data.notes.filter((n) => n.id !== id) }); setSelectedId(null); }}
        onBack={() => setSelectedId(null)} />
    );
  }

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
            <Sparkles size={13} className="text-amber-500" />
          </div>
          <span className="text-body-sm font-medium text-ink-muted dark:text-neutral-400">{data.notes.length} 条灵感</span>
        </div>
        <button onClick={() => setShowNew(true)} className="p-2 rounded-xl text-ink-muted dark:text-neutral-500 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-400/10 transition-all">
          <Plus size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-1">
        {sorted.length === 0 && !showNew && (
          <div className="text-center py-12">
            <Lightbulb size={32} className="mx-auto text-surface-300 dark:text-neutral-700 mb-3" />
            <p className="text-body-sm text-ink-hint dark:text-neutral-500">随时记录闪现的灵感</p>
            <button onClick={() => setShowNew(true)} className="mt-3 mdc-btn-outline text-xs">记录灵感</button>
          </div>
        )}
        {showNew && <NewIdeaInline onSave={(note) => { const u: IdeaNote = { ...note, id: nanoid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; setData({ notes: [u, ...data.notes], tags: [...new Set([...data.tags, ...note.tags])] }); setSelectedId(u.id); setShowNew(false); }} onCancel={() => setShowNew(false)} />}
        {sorted.map((note) => (
          <button key={note.id} onClick={() => setSelectedId(note.id)}
            className="w-full text-left px-4 py-3 rounded-2xl hover:bg-surface-100 dark:hover:bg-white/[0.02] transition-all group">
            <div className="flex items-start justify-between gap-2">
              <span className="text-body-sm font-semibold text-ink dark:text-neutral-200 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{note.title || '无标题'}</span>
              <span className="text-xs text-ink-hint dark:text-neutral-500 shrink-0 mt-0.5">{formatDate(note.updatedAt)}</span>
            </div>
            <p className="text-xs text-ink-muted dark:text-neutral-400 truncate mt-1.5 leading-relaxed">{note.content.slice(0, 100) || '空内容'}</p>
            {note.tags.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {note.tags.map((tag) => (<span key={tag} className="text-xs px-2 py-0.5 rounded-lg bg-surface-100 dark:bg-white/[0.03] text-ink-hint dark:text-neutral-500 border border-surface-200 dark:border-white/[0.03]">{tag}</span>))}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function NewIdeaInline({ onSave, onCancel }: { onSave: (note: Omit<IdeaNote, 'id' | 'createdAt' | 'updatedAt'>) => void; onCancel: () => void; }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  return (
    <div className="p-4 space-y-3 bg-amber-50/50 dark:bg-amber-500/[0.03] rounded-2xl border border-amber-100 dark:border-amber-500/10">
      <input type="text" placeholder="灵感标题..." value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-transparent text-body font-semibold text-ink dark:text-neutral-200 placeholder:text-ink-hint dark:placeholder:text-neutral-600 focus:outline-none" autoFocus />
      <textarea placeholder="记录你的想法..." value={content} onChange={(e) => setContent(e.target.value)} rows={3} className="w-full bg-transparent text-body-sm text-ink-secondary dark:text-neutral-300 placeholder:text-ink-hint dark:placeholder:text-neutral-600 focus:outline-none resize-none leading-relaxed" />
      <div className="flex items-center gap-1.5 flex-wrap">
        {tags.map((t) => (<span key={t} className="text-xs px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 flex items-center gap-1 border border-amber-200 dark:border-amber-500/10">{t} <button onClick={() => setTags(tags.filter((x) => x !== t))}><X size={10} /></button></span>))}
        <input type="text" placeholder="标签..." value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const t = tagInput.trim(); if (t && !tags.includes(t)) setTags([...tags, t]); setTagInput(''); } }} className="w-20 bg-transparent text-xs text-ink-muted dark:text-neutral-400 placeholder:text-ink-hint dark:placeholder:text-neutral-700 focus:outline-none" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-body-sm text-ink-muted dark:text-neutral-500 hover:text-ink dark:hover:text-neutral-200 rounded-xl hover:bg-surface-100 dark:hover:bg-white/[0.04] transition-all">取消</button>
        <button onClick={() => onSave({ title, content, tags })} className="mdc-btn">保存灵感</button>
      </div>
    </div>
  );
}

function IdeaDetail({ note, onSave, onDelete, onBack }: { note: IdeaNote; onSave: (n: IdeaNote) => void; onDelete: (id: string) => void; onBack: () => void; }) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1.5 rounded-xl text-ink-hint dark:text-neutral-500 hover:text-ink dark:hover:text-neutral-200 hover:bg-surface-100 dark:hover:bg-white/[0.06] transition-all"><ChevronLeft size={18} /></button>
        <span className="text-xs text-ink-hint dark:text-neutral-500">{formatDate(note.createdAt)}</span>
        <button onClick={() => onDelete(note.id)} className="ml-auto p-1.5 rounded-xl text-ink-hint dark:text-neutral-600 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-all"><Trash2 size={15} /></button>
      </div>
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => onSave({ ...note, title, content, updatedAt: new Date().toISOString() })} className="w-full bg-transparent text-lg font-bold text-ink dark:text-neutral-100 placeholder:text-ink-hint dark:placeholder:text-neutral-600 focus:outline-none" placeholder="灵感标题" />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} onBlur={() => onSave({ ...note, title, content, updatedAt: new Date().toISOString() })} className="flex-1 w-full bg-transparent text-body text-ink-secondary dark:text-neutral-300 placeholder:text-ink-hint dark:placeholder:text-neutral-600 focus:outline-none resize-none leading-relaxed" placeholder="展开你的想法..." />
      <div className="flex gap-1.5 flex-wrap">{note.tags.map((t) => (<span key={t} className="text-xs px-2.5 py-1 rounded-lg bg-surface-100 dark:bg-white/[0.03] text-ink-muted dark:text-neutral-500 border border-surface-200 dark:border-white/[0.03]">{t}</span>))}</div>
    </div>
  );
}
