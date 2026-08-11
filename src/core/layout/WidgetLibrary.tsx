import { useRef, useMemo, useState } from 'react';
import { Search, X, LayoutGrid, CheckCheck, Lightbulb, Bookmark, Wrench, Clock, StickyNote, Sparkles, Zap, Globe, Pen } from 'lucide-react';
import { widgetRegistry } from '../registry/WidgetRegistry';
import { useWorkspaceStore } from '../store/workspaceStore';
import type { WidgetCategory } from '../registry/types';

const iconMap: Record<string, React.ComponentType<any>> = {
  'layout-grid': LayoutGrid, 'check-check': CheckCheck, lightbulb: Lightbulb, bookmark: Bookmark, wrench: Wrench, clock: Clock, 'sticky-note': StickyNote, sparkles: Sparkles, zap: Zap, globe: Globe,
};

const catCfg: Record<WidgetCategory, { label: string; icon: React.ComponentType<any>; color: string }> = {
  productivity: { label: '效率工具', icon: Zap, color: 'text-amber-500 dark:text-amber-400' },
  reference: { label: '参考资料', icon: Globe, color: 'text-blue-500 dark:text-blue-400' },
  info: { label: '信息展示', icon: Sparkles, color: 'text-purple-500 dark:text-purple-400' },
  custom: { label: '自定义', icon: LayoutGrid, color: 'text-emerald-500 dark:text-emerald-400' },
};

interface WidgetLibraryProps { editMode: boolean; }

export function WidgetLibrary({ editMode }: WidgetLibraryProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<WidgetCategory | 'all'>('all');
  const addWidget = useWorkspaceStore((s) => s.addWidget);
  const widgets = useWorkspaceStore((s) => s.widgets);
  const searchRef = useRef<HTMLInputElement>(null);

  const allWidgets = widgetRegistry.getAll();
  const categories = [...new Set(allWidgets.map((w) => w.category))] as WidgetCategory[];

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allWidgets.filter((w) => {
      const ms = !q || w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q) || w.id.toLowerCase().includes(q);
      return ms && (activeCategory === 'all' || w.category === activeCategory);
    });
  }, [search, activeCategory, allWidgets]);

  const widgetCounts = useMemo(() => {
    const c: Record<string, number> = {};
    widgets.forEach((w) => { c[w.widgetId] = (c[w.widgetId] || 0) + 1; });
    return c;
  }, [widgets]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.04] dark:border-white/[0.04]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center">
            <LayoutGrid size={16} className="text-primary-500" />
          </div>
          <h2 className="text-sm font-bold text-ink dark:text-neutral-100 tracking-wide">部件库</h2>
          <span className="text-xs text-ink-hint dark:text-neutral-500">{allWidgets.length}</span>
        </div>
      </div>

      {!editMode ? (
        /* View mode - locked state */
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-3">
            <Pen size={28} className="mx-auto text-surface-300 dark:text-neutral-700" />
            <p className="text-body-sm text-ink-hint dark:text-neutral-500 leading-relaxed">
              点击顶栏「编辑中」按钮<br />进入编辑模式管理部件
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="px-4 py-3">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-hint dark:text-neutral-500 pointer-events-none" />
              <input id="widget-search" ref={searchRef} type="text" placeholder="搜索部件..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 mdc-input" />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-lg text-ink-hint dark:text-neutral-500 hover:text-ink dark:hover:text-neutral-300">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Categories */}
          <div className="px-4 pb-3 flex gap-1.5 overflow-x-auto scrollbar-none flex-nowrap">
            <button onClick={() => setActiveCategory('all')} className={`mdc-chip ${activeCategory === 'all' ? 'mdc-chip-active' : ''}`}>全部</button>
            {categories.map((cat) => {
              const cfg = catCfg[cat]; const Icon = cfg?.icon || LayoutGrid;
              return (
                <button key={cat} onClick={() => setActiveCategory(cat)} className={`mdc-chip ${activeCategory === cat ? 'mdc-chip-active' : ''}`}>
                  <Icon size={12} className={cfg?.color} />{cfg?.label || cat}
                </button>
              );
            })}
          </div>

          {/* Widget list */}
          <div className="flex-1 overflow-y-auto px-3 py-1 space-y-0.5">
            {filtered.length === 0 && (
              <div className="text-center py-12">
                <Search size={24} className="mx-auto text-surface-300 dark:text-neutral-700 mb-3" />
                <p className="text-body-sm text-ink-hint dark:text-neutral-500">没有匹配的部件</p>
              </div>
            )}
            {filtered.map((widget) => {
              const Icon = iconMap[widget.icon] || LayoutGrid;
              const count = widgetCounts[widget.id] || 0;
              return (
                <button key={widget.id} onClick={() => addWidget(widget.id)}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl hover:bg-surface-100 dark:hover:bg-white/[0.03] active:scale-[0.985] transition-all text-left group">
                  <div className="w-9 h-9 rounded-xl bg-surface-100 dark:bg-white/[0.03] border border-surface-200 dark:border-white/[0.04] flex items-center justify-center text-ink-muted dark:text-neutral-500 group-hover:text-primary-500 dark:group-hover:text-primary-400 group-hover:border-primary-200 dark:group-hover:border-primary-500/20 group-hover:bg-primary-50 dark:group-hover:bg-primary-500/[0.04] transition-all shrink-0">
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-body-sm font-medium text-ink-secondary dark:text-neutral-300 group-hover:text-ink dark:group-hover:text-neutral-100 transition-colors">{widget.name}</span>
                      {count > 0 && <span className="text-xs px-1.5 py-0 rounded-md bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400 font-bold">{count}</span>}
                    </div>
                    <div className="text-xs text-ink-hint dark:text-neutral-600 truncate mt-0.5">{widget.description}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-black/[0.04] dark:border-white/[0.04]">
            <p className="text-2xs text-ink-hint dark:text-neutral-600 text-center">点击添加 · 拖拽移动 · 右下角调整大小</p>
          </div>
        </>
      )}
    </div>
  );
}
