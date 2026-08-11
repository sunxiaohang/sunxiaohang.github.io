import { Plus, LayoutGrid } from 'lucide-react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { Button } from '@/shared/ui/button';

interface StatusBarProps {
  editMode: boolean;
  onOpenDrawer: () => void;
}

export function StatusBar({ editMode, onOpenDrawer }: StatusBarProps) {
  const widgets = useWorkspaceStore((s) => s.widgets);

  return (
    <div className="h-12 shrink-0 border-t border-border/50 bg-card flex items-center justify-between px-4 z-20">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LayoutGrid size={12} />
        <span>{widgets.length} 个部件</span>
      </div>

      <Button
        size="sm"
        variant="default"
        onClick={onOpenDrawer}
        disabled={!editMode}
        className="gap-1.5 rounded-2xl"
      >
        <Plus size={14} />
        添加部件
      </Button>
    </div>
  );
}
