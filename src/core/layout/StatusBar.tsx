import { Plus, LayoutGrid } from 'lucide-react';
import { useWorkspaceStore } from '../store/workspaceStore';

interface StatusBarProps {
  onOpenDrawer: () => void;
}

export function StatusBar({ onOpenDrawer }: StatusBarProps) {
  const widgets = useWorkspaceStore((s) => s.widgets);

  return (
    <div className="h-12 shrink-0 border-t border-border/50 bg-card flex items-center justify-between px-4 z-20">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LayoutGrid size={12} />
        <span>{widgets.length} 个部件</span>
      </div>

      <button
        onClick={onOpenDrawer}
        className="inline-flex items-center gap-1.5 h-8 px-4 rounded-2xl bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:bg-primary/90 active:scale-[0.97] transition-all"
      >
        <Plus size={14} />
        添加部件
      </button>
    </div>
  );
}
