import { Eye, Pen, Plus, LayoutGrid } from 'lucide-react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { Button } from '@/shared/ui/button';

interface StatusBarProps {
  editMode: boolean;
  onToggleEdit: () => void;
  onOpenDrawer: () => void;
}

export function StatusBar({ editMode, onToggleEdit, onOpenDrawer }: StatusBarProps) {
  const widgets = useWorkspaceStore((s) => s.widgets);

  return (
    <div className="h-12 shrink-0 border-t border-border/50 bg-card flex items-center justify-between px-4 z-20">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LayoutGrid size={12} />
          <span>{widgets.length} 个部件</span>
        </div>

        <button
          onClick={onToggleEdit}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold transition-all ${
            editMode
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent'
          }`}
        >
          {editMode ? <Pen size={12} /> : <Eye size={12} />}
          {editMode ? '编辑中' : '预览'}
        </button>
      </div>

      <Button
        size="sm"
        variant={editMode ? 'default' : 'ghost'}
        onClick={onOpenDrawer}
        disabled={!editMode}
        className="gap-1.5"
      >
        <Plus size={14} />
        添加部件
      </Button>
    </div>
  );
}
