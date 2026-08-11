import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import GridLayout from 'react-grid-layout';
import { useWorkspaceStore } from '../store/workspaceStore';
import { WidgetCard } from './WidgetCard';
import { LayoutGrid, Plus } from 'lucide-react';

export function Workspace() {
  const widgets = useWorkspaceStore((s) => s.widgets);
  const updateLayout = useWorkspaceStore((s) => s.updateLayout);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Observe actual container width (panel is now resizable)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width - 32); // 2*padding
      }
    });

    observer.observe(el);
    // Initial measurement
    setContainerWidth(el.clientWidth - 32);

    return () => observer.disconnect();
  }, []);

  const layout = useMemo(
    () => widgets.map((w) => ({ i: w.instanceId, x: w.x, y: w.y, w: w.cols, h: w.rows, minW: 3, minH: 2 })),
    [widgets]
  );

  const handleLayoutChange = useCallback(
    (l: Array<{ i: string; x: number; y: number; w: number; h: number }>) => updateLayout(l),
    [updateLayout]
  );

  if (widgets.length === 0) {
    return (
      <div ref={containerRef} className="flex-1 flex items-center justify-center min-h-full">
        <div className="text-center space-y-5 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-xl bg-surface-100 dark:bg-white/[0.02] border border-surface-200 dark:border-white/[0.04]">
            <LayoutGrid size={32} className="text-surface-300 dark:text-neutral-700" />
          </div>
          <div className="space-y-1.5">
            <p className="text-base font-semibold text-ink-muted dark:text-neutral-400">工作区为空</p>
            <p className="text-body-sm text-ink-hint dark:text-neutral-500">从右侧部件库选择部件添加到工作区</p>
          </div>
          <button onClick={() => { document.getElementById('widget-search')?.focus(); }}
            className="mdc-btn-outline">
            <Plus size={15} />浏览部件库
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full p-4">
      <GridLayout
        className="layout" layout={layout} cols={12} rowHeight={76}
        width={containerWidth} onLayoutChange={handleLayoutChange}
        draggableHandle=".drag-handle" margin={[16, 16]} containerPadding={[0, 0]}
        resizeHandles={['se']} compactType="vertical" isDraggable isResizable
      >
        {widgets.map((w) => (
          <div key={w.instanceId}><WidgetCard instanceId={w.instanceId} /></div>
        ))}
      </GridLayout>
    </div>
  );
}
