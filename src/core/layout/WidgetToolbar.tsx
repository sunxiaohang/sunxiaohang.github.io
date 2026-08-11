import { useState } from 'react';
import { Plus, X, LayoutGrid, CheckCheck, Lightbulb, Bookmark, Wrench, Clock, StickyNote, Globe } from 'lucide-react';
import { widgetRegistry } from '../registry/WidgetRegistry';
import { useWorkspaceStore } from '../store/workspaceStore';

const iconMap: Record<string, React.ComponentType<any>> = {
  'layout-grid': LayoutGrid, 'check-check': CheckCheck, lightbulb: Lightbulb,
  bookmark: Bookmark, wrench: Wrench, clock: Clock, 'sticky-note': StickyNote, globe: Globe,
};

interface WidgetToolbarProps {
  editMode: boolean;
}

export function WidgetToolbar({ editMode }: WidgetToolbarProps) {
  const addWidget = useWorkspaceStore((s) => s.addWidget);
  const widgets = useWorkspaceStore((s) => s.widgets);

  if (!editMode) return null;

  const allWidgets = widgetRegistry.getAll();
  const widgetCounts: Record<string, number> = {};
  widgets.forEach((w) => { widgetCounts[w.widgetId] = (widgetCounts[w.widgetId] || 0) + 1; });

  return (
    <div className="h-16 shrink-0 border-t border-black/[0.04] dark:border-white/[0.04] bg-white/80 dark:bg-[#0f0f14]/80 backdrop-blur-sm flex items-center px-4 gap-2 overflow-x-auto scrollbar-none animate-fade-in">
      <div className="flex items-center gap-0.5 mr-2 shrink-0">
        <LayoutGrid size={13} className="text-ink-hint dark:text-neutral-500" />
        <span className="text-xs font-semibold text-ink-muted dark:text-neutral-400 whitespace-nowrap">添加部件</span>
      </div>

      {allWidgets.map((widget) => {
        const Icon = iconMap[widget.icon] || LayoutGrid;
        const count = widgetCounts[widget.id] || 0;
        return (
          <button
            key={widget.id}
            onClick={() => addWidget(widget.id)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-surface-100 dark:hover:bg-white/[0.04] active:scale-95 transition-all group shrink-0"
            title={widget.description}
          >
            <div className="w-7 h-7 rounded-lg bg-surface-100 dark:bg-white/[0.03] border border-surface-200 dark:border-white/[0.04] flex items-center justify-center text-ink-muted dark:text-neutral-500 group-hover:text-primary-500 dark:group-hover:text-primary-400 group-hover:border-primary-200 dark:group-hover:border-primary-500/20 transition-all">
              <Icon size={14} />
            </div>
            <div className="text-left">
              <div className="text-xs font-medium text-ink-muted dark:text-neutral-400 group-hover:text-ink dark:group-hover:text-neutral-200 transition-colors whitespace-nowrap">
                {widget.name}
                {count > 0 && <span className="ml-1 text-2xs text-primary-500">{count}</span>}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
