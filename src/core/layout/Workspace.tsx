import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import GridLayout from 'react-grid-layout';
import { motion } from 'framer-motion';
import { useWorkspaceStore } from '../store/workspaceStore';
import { WidgetCard } from './WidgetCard';
import { Sparkles } from 'lucide-react';

interface WorkspaceProps { editMode: boolean; }

export function Workspace({ editMode }: WorkspaceProps) {
  const widgets = useWorkspaceStore((s) => s.widgets);
  const updateLayout = useWorkspaceStore((s) => s.updateLayout);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const e of entries) setContainerWidth(e.contentRect.width - 32);
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth - 32);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(
    () => widgets.map(w => ({ i: w.instanceId, x: w.x, y: w.y, w: w.cols, h: w.rows, minW: 3, minH: 2 })),
    [widgets]
  );

  const handleLayoutChange = useCallback(
    (l: Array<{ i: string; x: number; y: number; w: number; h: number }>) => updateLayout(l),
    [updateLayout]
  );

  if (widgets.length === 0) {
    return (
      <div ref={containerRef} className="flex-1 flex items-center justify-center min-h-full">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-5">
          <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }} className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-secondary border border-border/50">
            <span className="text-4xl">🪄</span>
          </motion.div>
          <div className="space-y-1.5">
            <p className="text-base font-semibold text-muted-foreground">工作区为空</p>
            <p className="text-sm text-muted-foreground/70">
              {editMode ? '点击底部「添加部件」开始 ✨' : '切换到编辑模式添加部件 🎨'}
            </p>
          </div>
        </motion.div>
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
        {widgets.map(w => (
          <div key={w.instanceId}>
            <WidgetCard instanceId={w.instanceId} editMode={editMode} />
          </div>
        ))}
      </GridLayout>
    </div>
  );
}
