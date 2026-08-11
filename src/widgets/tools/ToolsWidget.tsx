import { useState, useMemo } from 'react';
import { Plus, Trash2, X, Wrench, Box } from 'lucide-react';
import { useWidgetData } from '@/hooks/useWidgetData';
import { nanoid } from '@/lib/utils';
import type { WidgetProps } from '@/core/registry/types';
import type { Tool, ToolsData } from './types';

const defaultData: ToolsData = { tools: [], categories: ['开发', '设计', '效率', '其他'] };

export default function ToolsWidget({}: WidgetProps) {
  const [data, setData, loading] = useWidgetData<ToolsData>('tools-main', defaultData);
  const [showAdd, setShowAdd] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const filtered = useMemo(() => activeCat ? data.tools.filter((t) => t.category === activeCat) : data.tools, [data.tools, activeCat]);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-5 h-5 border-2 border-surface-300 dark:border-white/[0.08] border-t-primary-500 rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col h-full gap-3 relative">
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setActiveCat(null)} className={`mdc-chip ${activeCat === null ? 'mdc-chip-active' : ''}`}>全部</button>
        {data.categories.map((cat) => (
          <button key={cat} onClick={() => setActiveCat(cat)} className={`mdc-chip ${activeCat === cat ? 'mdc-chip-active' : ''}`}>{cat}</button>
        ))}
        <button onClick={() => setShowAdd(true)} className="ml-auto p-2 rounded-xl text-ink-muted dark:text-neutral-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-400/10 transition-all">
          <Plus size={16} />
        </button>
      </div>

      <div className="flex-1">
        {filtered.length === 0 && (
          <div className="text-center py-10">
            <Box size={28} className="mx-auto text-surface-300 dark:text-neutral-700 mb-3" />
            <p className="text-body-sm text-ink-hint dark:text-neutral-500">{data.tools.length === 0 ? '添加常用工具和应用' : '该分类暂无工具'}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          {filtered.map((tool) => (
            <a key={tool.id} href={tool.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-surface-50 dark:bg-white/[0.015] hover:bg-surface-100 dark:hover:bg-white/[0.04] transition-all group no-underline border border-surface-100 dark:border-white/[0.03] hover:border-surface-200 dark:hover:border-white/[0.06] hover:shadow-card">
              <div className="w-9 h-9 rounded-xl bg-surface-100 dark:bg-white/[0.03] border border-surface-200 dark:border-white/[0.04] flex items-center justify-center shrink-0 group-hover:border-surface-300 dark:group-hover:border-white/[0.1] transition-all">
                {tool.icon ? <img src={tool.icon} alt="" className="w-5 h-5 rounded" /> : <Wrench size={16} className="text-ink-muted dark:text-neutral-500 group-hover:text-ink-secondary dark:group-hover:text-neutral-300 transition-colors" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-body-sm font-semibold text-ink dark:text-neutral-300 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{tool.name}</div>
                {tool.description && <div className="text-xs text-ink-hint dark:text-neutral-500 truncate mt-0.5">{tool.description}</div>}
              </div>
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setData({ ...data, tools: data.tools.filter((t) => t.id !== tool.id) }); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-ink-hint dark:text-neutral-600 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-all shrink-0"><Trash2 size={13} /></button>
            </a>
          ))}
        </div>
      </div>

      {showAdd && <AddDialog categories={data.categories} onAdd={(t) => { setData({ ...data, tools: [t, ...data.tools] }); setShowAdd(false); }} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function AddDialog({ categories, onAdd, onClose }: { categories: string[]; onAdd: (t: Tool) => void; onClose: () => void; }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[0] || '');
  const [newCat, setNewCat] = useState('');
  const h = (e: React.FormEvent) => { e.preventDefault(); if (!name.trim() || !url.trim()) return; onAdd({ id: nanoid(), name: name.trim(), url: url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`, description: description.trim(), category: newCat.trim() || category, createdAt: new Date().toISOString() }); };

  return (
    <div className="absolute inset-0 bg-white/95 dark:bg-[#0d0d10]/95 backdrop-blur-sm rounded-3xl flex items-center justify-center z-10 p-5">
      <form onSubmit={h} className="w-full max-w-[280px] space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-ink dark:text-neutral-100">添加工具</span>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl text-ink-hint dark:text-neutral-500 hover:text-ink dark:hover:text-neutral-200 hover:bg-surface-100 dark:hover:bg-white/[0.06]"><X size={16} /></button>
        </div>
        <input type="text" placeholder="工具名称" value={name} onChange={(e) => setName(e.target.value)} className="mdc-input" autoFocus />
        <input type="text" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} className="mdc-input" />
        <input type="text" placeholder="简短描述（可选）" value={description} onChange={(e) => setDescription(e.target.value)} className="mdc-input" />
        <div className="flex gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="flex-1 mdc-input">
            {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          <input type="text" placeholder="新分类" value={newCat} onChange={(e) => setNewCat(e.target.value)} className="w-24 mdc-input" />
        </div>
        <button type="submit" className="mdc-btn w-full !bg-emerald-500 hover:!bg-emerald-600">添加工具</button>
      </form>
    </div>
  );
}
