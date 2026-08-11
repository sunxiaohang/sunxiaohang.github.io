import { X, LayoutGrid, CheckCheck, Lightbulb, Bookmark, Wrench, Clock, StickyNote, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { widgetRegistry } from '../registry/WidgetRegistry';
import { useWorkspaceStore } from '../store/workspaceStore';

const iconMap: Record<string, React.ComponentType<any>> = {
  'layout-grid': LayoutGrid, 'check-check': CheckCheck, lightbulb: Lightbulb,
  bookmark: Bookmark, wrench: Wrench, clock: Clock, 'sticky-note': StickyNote, globe: Globe,
};

const widgetEmoji: Record<string, string> = {
  clock: '🕐', bookmarks: '🔖', ideas: '💡', tools: '🧰', 'quick-note': '📝', 'quick-links': '🔗',
};

interface WidgetDrawerProps { open: boolean; onClose: () => void; }

export function WidgetDrawer({ open, onClose }: WidgetDrawerProps) {
  const addWidget = useWorkspaceStore((s) => s.addWidget);
  const widgets = useWorkspaceStore((s) => s.widgets);

  const allWidgets = widgetRegistry.getAll();
  const widgetCounts: Record<string, number> = {};
  widgets.forEach((w) => { widgetCounts[w.widgetId] = (widgetCounts[w.widgetId] || 0) + 1; });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 dark:bg-black/60 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50"
          >
            <div className="bg-card border-t border-border/50 rounded-t-3xl shadow-2xl max-h-[65vh] overflow-y-auto">
              <div className="sticky top-0 bg-card pt-3 pb-2 px-5 border-b border-border/30 rounded-t-3xl">
                <div className="flex justify-center mb-3">
                  <div className="w-10 h-1.5 rounded-full bg-border" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🧩</span>
                    <h3 className="text-base font-bold text-foreground">添加部件</h3>
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{allWidgets.length}</span>
                  </div>
                  <button onClick={onClose} className="p-1.5 rounded-2xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="p-4 grid grid-cols-3 gap-3">
                {allWidgets.map((widget, i) => {
                  const Icon = iconMap[widget.icon] || LayoutGrid;
                  const count = widgetCounts[widget.id] || 0;
                  return (
                    <motion.button
                      key={widget.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => { addWidget(widget.id); onClose(); }}
                      className="flex flex-col items-center gap-2 p-4 rounded-3xl hover:bg-secondary active:scale-95 transition-all group"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-secondary to-secondary/50 border border-border/50 flex items-center justify-center group-hover:scale-110 transition-transform relative shadow-sm">
                        <span className="text-2xl">{widgetEmoji[widget.id] || '📦'}</span>
                        {count > 0 && (
                          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-sm">
                            {count}
                          </span>
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-semibold text-foreground/80 group-hover:text-foreground transition-colors">{widget.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{widget.description}</div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
