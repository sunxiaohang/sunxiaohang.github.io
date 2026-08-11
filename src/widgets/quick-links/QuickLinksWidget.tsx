import { useState } from 'react';
import { Plus, X, Pencil, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWidgetData } from '@/hooks/useWidgetData';
import { useEditMode } from '@/core/layout/EditModeContext';
import { nanoid } from '@/lib/utils';
import type { WidgetProps } from '@/core/registry/types';
import type { QuickLink, QuickLinksData } from './types';

const defaultData: QuickLinksData = { links: [] };
const presets: Omit<QuickLink, 'id' | 'createdAt'>[] = [
  { name: 'Bilibili', url: 'https://www.bilibili.com' },
  { name: '腾讯视频', url: 'https://v.qq.com' },
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'GitHub', url: 'https://github.com' },
];

function getFavicon(url: string): string {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`; } catch { return ''; }
}

export default function QuickLinksWidget({}: WidgetProps) {
  const [data, setData, loading] = useWidgetData<QuickLinksData>('quick-links-main', defaultData);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { editMode } = useEditMode();

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" /></div>;

  const links = data.links;
  const isEmpty = links.length === 0 && !showAdd;

  const handleAdd = (link: QuickLink) => { setData({ links: [...data.links, link] }); setShowAdd(false); };
  const handleDelete = (id: string) => { setData({ links: data.links.filter(l => l.id !== id) }); };
  const handleUpdate = (id: string, name: string, url: string) => {
    setData({ links: data.links.map(l => l.id === id ? { ...l, name, url, icon: getFavicon(url) } : l) });
    setEditingId(null);
  };

  return (
    <div className="flex items-center h-full gap-1">
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1 h-full py-1">
        {isEmpty && (
          <div className="flex items-center gap-2 text-muted-foreground min-w-max">
            <span className="text-lg">🌐</span>
            <span className="text-sm">添加快捷链接</span>
            {editMode && (
            <div className="flex gap-1">
              {presets.map(p => (
                <button key={p.url} onClick={() => setData({ links: [...data.links, { ...p, id: nanoid(), icon: getFavicon(p.url), createdAt: new Date().toISOString() }] })}
                  className="px-2.5 py-1 text-xs rounded-2xl bg-secondary text-muted-foreground border border-border/50 hover:text-primary hover:border-primary/30 transition-all">+{p.name}</button>
              ))}
            </div>
            )}
          </div>
        )}

        <AnimatePresence>
          {links.map(link => (
            editingId === link.id ? (
              <EditForm key={link.id} initialName={link.name} initialUrl={link.url}
                onSave={(n,u) => handleUpdate(link.id, n, u)} onCancel={() => setEditingId(null)} />
            ) : (
              <motion.a
                key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl hover:bg-secondary transition-all group relative shrink-0 no-underline min-w-[64px]"
                title={link.url}
              >
                <div className="w-10 h-10 rounded-2xl bg-secondary border border-border/50 flex items-center justify-center overflow-hidden group-hover:border-primary/30 group-hover:shadow-sm transition-all">
                  {link.icon ? <img src={link.icon} alt="" className="w-6 h-6 rounded" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> :
                    <Globe size={20} className="text-muted-foreground" />}
                </div>
                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors truncate max-w-[72px]">{link.name}</span>
                {editMode && (
                <div className="absolute -top-0.5 -right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={e => { e.preventDefault(); e.stopPropagation(); setEditingId(link.id); }}
                    className="w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center hover:bg-sky-50 dark:hover:bg-sky-500/10 hover:border-sky-200 dark:hover:border-sky-500/20 transition-all" title="编辑">
                    <Pencil size={9} className="text-muted-foreground hover:text-sky-500" /></button>
                  <button onClick={e => { e.preventDefault(); e.stopPropagation(); handleDelete(link.id); }}
                    className="w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center hover:bg-coral-50 dark:hover:bg-coral-500/10 hover:border-coral-200 dark:hover:border-coral-500/20 transition-all" title="删除">
                    <X size={9} className="text-muted-foreground hover:text-coral-500" /></button>
                </div>
                )}
              </motion.a>
            )
          ))}
        </AnimatePresence>
      </div>

      {editMode && (
        !showAdd ? (
          <button onClick={() => setShowAdd(true)}
            className="w-10 h-10 shrink-0 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all">
            <Plus size={18} /></button>
        ) : (
          <AddForm onAdd={handleAdd} onClose={() => setShowAdd(false)} />
        )
      )}
    </div>
  );
}

function AddForm({ onAdd, onClose }: { onAdd: (link: QuickLink) => void; onClose: () => void; }) {
  const [name, setName] = useState(''); const [url, setUrl] = useState('');
  return (
    <motion.form initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} onSubmit={e => { e.preventDefault(); if (!name.trim() || !url.trim()) return; const u = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`; onAdd({ id: nanoid(), name: name.trim(), url: u, icon: getFavicon(u), createdAt: new Date().toISOString() }); }}
      className="flex items-center gap-1.5 shrink-0">
      <input type="text" placeholder="名称" value={name} onChange={e => setName(e.target.value)} className="w-20 h-9 px-3 bg-secondary border border-border rounded-2xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-all" autoFocus />
      <input type="text" placeholder="https://" value={url} onChange={e => setUrl(e.target.value)} className="w-32 h-9 px-3 bg-secondary border border-border rounded-2xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-all" />
      <button type="submit" className="inline-flex items-center justify-center h-8 px-4 rounded-2xl bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:bg-primary/90 active:scale-95 transition-all">添加</button>
      <button type="button" onClick={onClose} className="p-1.5 rounded-2xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"><X size={14} /></button>
    </motion.form>
  );
}

function EditForm({ initialName, initialUrl, onSave, onCancel }: { initialName: string; initialUrl: string; onSave: (n: string, u: string) => void; onCancel: () => void; }) {
  const [name, setName] = useState(initialName); const [url, setUrl] = useState(initialUrl);
  return (
    <motion.form initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} onSubmit={e => { e.preventDefault(); if (!name.trim() || !url.trim()) return; const u = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`; onSave(name.trim(), u); }}
      className="flex items-center gap-1.5 shrink-0">
      <input type="text" placeholder="名称" value={name} onChange={e => setName(e.target.value)} className="w-20 h-9 px-3 bg-secondary border border-border rounded-2xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-all" autoFocus />
      <input type="text" placeholder="https://" value={url} onChange={e => setUrl(e.target.value)} className="w-32 h-9 px-3 bg-secondary border border-border rounded-2xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-all" />
      <button type="submit" className="inline-flex items-center justify-center h-8 px-4 rounded-2xl bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:bg-primary/90 active:scale-95 transition-all">保存</button>
      <button type="button" onClick={onCancel} className="p-1.5 rounded-2xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"><X size={14} /></button>
    </motion.form>
  );
}
