import { useState, useMemo } from 'react';
import { Plus, Trash2, X, Globe } from 'lucide-react';
import { useWidgetData } from '@/hooks/useWidgetData';
import { nanoid } from '@/lib/utils';
import type { WidgetProps } from '@/core/registry/types';
import type { Bookmark, BookmarksData } from './types';

const defaultData: BookmarksData = { bookmarks: [], categories: ['工作', '学习', '工具', '其他'] };
function getFavicon(url: string): string {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; } catch { return ''; }
}

export default function BookmarksWidget({}: WidgetProps) {
  const [data, setData, loading] = useWidgetData<BookmarksData>('bookmarks-main', defaultData);
  const [showAdd, setShowAdd] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const filtered = useMemo(() => activeCat ? data.bookmarks.filter((b) => b.category === activeCat) : data.bookmarks, [data.bookmarks, activeCat]);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-5 h-5 border-2 border-surface-300 dark:border-white/[0.08] border-t-primary-500 rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col h-full gap-3 relative">
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setActiveCat(null)} className={`mdc-chip ${activeCat === null ? 'mdc-chip-active' : ''}`}>全部</button>
        {data.categories.map((cat) => (
          <button key={cat} onClick={() => setActiveCat(cat)} className={`mdc-chip ${activeCat === cat ? 'mdc-chip-active' : ''}`}>{cat}</button>
        ))}
        <button onClick={() => setShowAdd(true)} className="ml-auto p-2 rounded-xl text-ink-muted dark:text-neutral-500 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-all">
          <Plus size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-0.5">
        {filtered.length === 0 && (
          <div className="text-center py-10">
            <Globe size={28} className="mx-auto text-surface-300 dark:text-neutral-700 mb-3" />
            <p className="text-body-sm text-ink-hint dark:text-neutral-500">{data.bookmarks.length === 0 ? '收藏常用网站链接' : '该分类暂无书签'}</p>
          </div>
        )}
        {filtered.map((bm) => (
          <a key={bm.id} href={bm.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-surface-100 dark:hover:bg-white/[0.02] transition-all group no-underline border border-transparent hover:border-surface-200 dark:hover:border-white/[0.04]">
            <div className="w-8 h-8 rounded-xl bg-surface-100 dark:bg-white/[0.03] border border-surface-200 dark:border-white/[0.04] flex items-center justify-center shrink-0 overflow-hidden">
              <img src={bm.icon || getFavicon(bm.url)} alt="" className="w-4 h-4 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-body-sm font-medium text-ink dark:text-neutral-300 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{bm.title}</div>
              <div className="text-xs text-ink-hint dark:text-neutral-500 truncate mt-0.5">{bm.url}</div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-lg bg-surface-100 dark:bg-white/[0.02] text-ink-hint dark:text-neutral-500 border border-surface-200 dark:border-white/[0.03] shrink-0">{bm.category}</span>
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setData({ ...data, bookmarks: data.bookmarks.filter((x) => x.id !== bm.id) }); }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-ink-hint dark:text-neutral-600 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-all shrink-0"><Trash2 size={13} /></button>
          </a>
        ))}
      </div>

      {showAdd && <AddDialog categories={data.categories} onAdd={(bm) => { setData({ ...data, bookmarks: [bm, ...data.bookmarks] }); setShowAdd(false); }} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function AddDialog({ categories, onAdd, onClose }: { categories: string[]; onAdd: (bm: Bookmark) => void; onClose: () => void; }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState(categories[0] || '');
  const [newCat, setNewCat] = useState('');
  const h = (e: React.FormEvent) => { e.preventDefault(); if (!title.trim() || !url.trim()) return; onAdd({ id: nanoid(), title: title.trim(), url: url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`, category: newCat.trim() || category, icon: getFavicon(url.trim()), createdAt: new Date().toISOString() }); };

  return (
    <div className="absolute inset-0 bg-white/95 dark:bg-[#0d0d10]/95 backdrop-blur-sm rounded-3xl flex items-center justify-center z-10 p-5">
      <form onSubmit={h} className="w-full max-w-[280px] space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-ink dark:text-neutral-100">添加书签</span>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl text-ink-hint dark:text-neutral-500 hover:text-ink dark:hover:text-neutral-200 hover:bg-surface-100 dark:hover:bg-white/[0.06]"><X size={16} /></button>
        </div>
        <input type="text" placeholder="网站标题" value={title} onChange={(e) => setTitle(e.target.value)} className="mdc-input" autoFocus />
        <input type="text" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} className="mdc-input" />
        <div className="flex gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="flex-1 mdc-input">
            {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          <input type="text" placeholder="新分类" value={newCat} onChange={(e) => setNewCat(e.target.value)} className="w-24 mdc-input" />
        </div>
        <button type="submit" className="mdc-btn w-full">添加书签</button>
      </form>
    </div>
  );
}
