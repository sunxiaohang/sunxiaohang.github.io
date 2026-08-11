import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import GridLayout from 'react-grid-layout';
import { useWorkspaceStore } from '../store/workspaceStore';
import { WidgetCard } from './WidgetCard';
import { LayoutGrid, Pen } from 'lucide-react';

interface WorkspaceProps {
  editMode: boolean;
}

export function Workspace({ editMode }: WorkspaceProps) {
  const widgets = useWorkspaceStore((s) => s.widgets);
  const updateLayout = useWorkspaceStore((s) => s.updateLayout);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width - 32);
    });
    observer.observe(el);
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
            <p className="text-body-sm text-ink-hint dark:text-neutral-500">
              {editMode ? '从右侧部件库选择部件添加' : '点击「编辑中」进入编辑模式添加部件'}
            </p>
          </div>
          {editMode && (
            <button onClick={() => document.getElementById('widget-search')?.focus()} className="mdc-btn-outline">
              <Pen size={14} />浏览部件库
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full p-4">
      <GridLayout
        className="layout" layout={layout} cols={12} rowHeight={76}
        width={containerWidth} onLayoutChange={handleLayoutChange}
        draggableHandle={editMode ? '.drag-handle' : '.no-drag'}
        margin={[16, 16]} containerPadding={[0, 0]}
        resizeHandles={editMode ? ['se'] : []}
        compactType="vertical"
        isDraggable={editMode}
        isResizable={editMode}
      >
        {widgets.map((w) => (
          <div key={w.instanceId}>
            <WidgetCard instanceId={w.instanceId} editMode={editMode} />
          </div>
        ))}
      </GridLayout>
    </div>
  );
}
