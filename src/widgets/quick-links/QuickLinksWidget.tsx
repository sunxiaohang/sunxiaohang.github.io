import { useState } from 'react';
import { Plus, X, Trash2, Globe, ExternalLink } from 'lucide-react';
import { useWidgetData } from '@/hooks/useWidgetData';
import { nanoid } from '@/lib/utils';
import type { WidgetProps } from '@/core/registry/types';
import type { QuickLink, QuickLinksData } from './types';

const defaultData: QuickLinksData = { links: [] };

// Preset sites for first-time users
const presets: Omit<QuickLink, 'id' | 'createdAt'>[] = [
  { name: 'Bilibili', url: 'https://www.bilibili.com' },
  { name: '腾讯视频', url: 'https://v.qq.com' },
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'GitHub', url: 'https://github.com' },
];

function getFavicon(url: string): string {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch { return ''; }
}

export default function QuickLinksWidget({}: WidgetProps) {
  const [data, setData, loading] = useWidgetData<QuickLinksData>('quick-links-main', defaultData);
  const [showAdd, setShowAdd] = useState(false);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-5 h-5 border-2 border-surface-300 dark:border-white/[0.08] border-t-primary-500 rounded-full animate-spin" /></div>;

  const links = data.links.length > 0 ? data.links : [];
  const isEmpty = links.length === 0;

  const handleAdd = (link: QuickLink) => {
    setData({ links: [...data.links, { ...link, icon: getFavicon(link.url) }] });
    setShowAdd(false);
  };

  const handleDelete = (id: string) => {
    setData({ links: data.links.filter((l) => l.id !== id) });
  };

  const handleAddPreset = (preset: typeof presets[0]) => {
    const link: QuickLink = {
      ...preset,
      id: nanoid(),
      icon: getFavicon(preset.url),
      createdAt: new Date().toISOString(),
    };
    setData({ links: [...data.links, link] });
  };

  return (
    <div className="flex items-center h-full gap-1">
      {/* Scrollable link row */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1 h-full py-1">
        {/* Empty state */}
        {isEmpty && !showAdd && (
          <div className="flex items-center gap-2 text-ink-hint dark:text-neutral-500 min-w-max">
            <Globe size={15} />
            <span className="text-body-sm">添加快捷链接</span>
            <div className="flex gap-1">
              {presets.map((p) => (
                <button
                  key={p.url}
                  onClick={() => handleAddPreset(p)}
                  className="px-2.5 py-1 text-xs rounded-lg bg-surface-100 dark:bg-white/[0.04] text-ink-muted dark:text-neutral-400 border border-surface-200 dark:border-white/[0.04] hover:text-primary-500 dark:hover:text-primary-400 hover:border-primary-200 dark:hover:border-primary-500/20 transition-all"
                >
                  +{p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Link items */}
        {links.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl hover:bg-surface-100 dark:hover:bg-white/[0.03] transition-all group relative shrink-0 no-underline min-w-[64px]"
            title={link.url}
          >
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl bg-surface-100 dark:bg-white/[0.03] border border-surface-200 dark:border-white/[0.04] flex items-center justify-center overflow-hidden group-hover:border-primary-200 dark:group-hover:border-primary-500/20 group-hover:shadow-sm transition-all">
              {link.icon ? (
                <img src={link.icon} alt="" className="w-6 h-6 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <Globe size={20} className="text-ink-hint dark:text-neutral-500" />
              )}
            </div>
            {/* Name */}
            <span className="text-xs text-ink-muted dark:text-neutral-400 group-hover:text-ink dark:group-hover:text-neutral-200 transition-colors truncate max-w-[72px]">
              {link.name}
            </span>
            {/* Delete button */}
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(link.id); }}
              className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-surface-200 dark:bg-neutral-800 border border-surface-300 dark:border-neutral-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-primary-50 dark:hover:bg-primary-500/10 hover:border-primary-200 dark:hover:border-primary-500/20"
            >
              <X size={10} className="text-ink-hint dark:text-neutral-500 hover:text-primary-500" />
            </button>
          </a>
        ))}
      </div>

      {/* Add button */}
      {!showAdd ? (
        <button
          onClick={() => setShowAdd(true)}
          className="w-10 h-10 shrink-0 rounded-xl border-2 border-dashed border-surface-300 dark:border-white/[0.06] flex items-center justify-center text-ink-hint dark:text-neutral-600 hover:border-primary-300 dark:hover:border-primary-500/30 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/[0.04] transition-all"
        >
          <Plus size={18} />
        </button>
      ) : (
        <AddForm
          onAdd={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

function AddForm({
  onAdd,
  onClose,
}: {
  onAdd: (link: QuickLink) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    const finalUrl = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
    onAdd({
      id: nanoid(),
      name: name.trim(),
      url: finalUrl,
      icon: getFavicon(finalUrl),
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5 shrink-0 animate-fade-in">
      <input
        type="text"
        placeholder="名称"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-20 px-2 py-2 bg-surface-100 dark:bg-white/[0.04] border border-surface-300 dark:border-white/[0.08] rounded-lg text-xs text-ink dark:text-neutral-200 placeholder:text-ink-hint dark:placeholder:text-neutral-600 focus:outline-none focus:border-primary-400 dark:focus:border-primary-500/30 transition-all"
        autoFocus
      />
      <input
        type="text"
        placeholder="https://"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="w-32 px-2 py-2 bg-surface-100 dark:bg-white/[0.04] border border-surface-300 dark:border-white/[0.08] rounded-lg text-xs text-ink dark:text-neutral-200 placeholder:text-ink-hint dark:placeholder:text-neutral-600 focus:outline-none focus:border-primary-400 dark:focus:border-primary-500/30 transition-all"
      />
      <button type="submit" className="mdc-btn px-3 py-2 text-xs">添加</button>
      <button type="button" onClick={onClose} className="p-2 rounded-lg text-ink-hint dark:text-neutral-500 hover:text-ink dark:hover:text-neutral-300 transition-all">
        <X size={14} />
      </button>
    </form>
  );
}
