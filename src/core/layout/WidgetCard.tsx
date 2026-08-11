import { useState, useEffect, ComponentType } from 'react';
import { GripVertical, X, Loader2 } from 'lucide-react';
import type { WidgetProps } from '../registry/types';
import { widgetRegistry } from '../registry/WidgetRegistry';
import { useWorkspaceStore } from '../store/workspaceStore';

interface WidgetCardProps { instanceId: string; }

export function WidgetCard({ instanceId }: WidgetCardProps) {
  const widgetInstance = useWorkspaceStore((s) => s.widgets.find((w) => w.instanceId === instanceId));
  const removeWidget = useWorkspaceStore((s) => s.removeWidget);
  const manifest = widgetInstance ? widgetRegistry.get(widgetInstance.widgetId) : undefined;

  const [WidgetComponent, setWidgetComponent] = useState<ComponentType<WidgetProps> | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!manifest) return;
    let cancelled = false;
    setLoadError(false);
    manifest.loader()
      .then((mod) => { if (!cancelled) setWidgetComponent(() => mod.default); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [manifest]);

  if (!widgetInstance || !manifest) return null;

  return (
    <div className="flex flex-col h-full mdc-card transition-shadow duration-200">
      {/* Drag handle */}
      <div className="flex items-center justify-between px-4 py-2.5 cursor-grab active:cursor-grabbing drag-handle select-none border-b border-black/[0.03] dark:border-white/[0.03] shrink-0">
        <div className="flex items-center gap-2 text-ink-hint dark:text-neutral-500">
          <GripVertical size={14} className="shrink-0" />
          <span className="text-body-sm font-medium text-ink-secondary dark:text-neutral-300 tracking-wide">
            {manifest.name}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); removeWidget(instanceId); }}
          className="p-1.5 rounded-lg text-ink-hint dark:text-neutral-600 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-all"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-visible">
        {loadError ? (
          <div className="flex items-center justify-center h-full text-ink-hint dark:text-neutral-500 text-body-sm">加载失败</div>
        ) : WidgetComponent ? (
          <WidgetComponent instanceId={instanceId} config={widgetInstance.config} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={20} className="text-primary-400 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
