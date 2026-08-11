import { useState, useEffect, useRef, ComponentType } from 'react';
import { GripVertical, X, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import type { WidgetProps } from '../registry/types';
import { widgetRegistry } from '../registry/WidgetRegistry';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useEditMode } from './EditModeContext';

interface WidgetCardProps { instanceId: string; editMode: boolean; }

export function WidgetCard({ instanceId, editMode }: WidgetCardProps) {
  const widgetInstance = useWorkspaceStore((s) => s.widgets.find((w) => w.instanceId === instanceId));
  const removeWidget = useWorkspaceStore((s) => s.removeWidget);
  const manifest = widgetInstance ? widgetRegistry.get(widgetInstance.widgetId) : undefined;
  const { toggle } = useEditMode();

  const [WidgetComponent, setWidgetComponent] = useState<ComponentType<WidgetProps> | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Long-press detection
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const longPressTriggered = useRef(false);

  const handleHeaderMouseDown = () => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      toggle();
    }, 500);
  };

  const handleHeaderMouseUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = undefined;
    }
  };

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col h-full fun-card"
    >
      <div
        onMouseDown={handleHeaderMouseDown}
        onMouseUp={handleHeaderMouseUp}
        onMouseLeave={handleHeaderMouseUp}
        className={`flex items-center justify-between px-4 py-2.5 select-none border-b border-border/30 shrink-0 transition-colors ${editMode ? 'cursor-grab active:cursor-grabbing drag-handle' : 'cursor-pointer'}`}
        title="长按切换编辑模式"
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          {editMode && <GripVertical size={14} className="shrink-0" />}
          <span className="text-sm font-semibold text-foreground/80 tracking-wide">{manifest.name}</span>
        </div>
        {editMode && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); removeWidget(instanceId); }}
            className="p-1.5 rounded-xl text-muted-foreground hover:text-coral-500 hover:bg-coral-50 dark:hover:bg-coral-500/10 transition-all"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="flex-1 p-4 overflow-visible">
        {loadError ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">😵 加载失败</div>
        ) : WidgetComponent ? (
          <WidgetComponent instanceId={instanceId} config={widgetInstance.config} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={20} className="text-primary animate-spin" />
          </div>
        )}
      </div>
    </motion.div>
  );
}
