import { useState, useEffect } from 'react';
import { Download, Upload, RotateCcw, Command, Sun, Moon } from 'lucide-react';
import { Workspace } from '@/core/layout/Workspace';
import { WidgetLibrary } from '@/core/layout/WidgetLibrary';
import { TodoPanel } from '@/core/layout/TodoPanel';
import { useWorkspaceStore } from '@/core/store/workspaceStore';
import { useTheme } from '@/hooks/useTheme';
import { exportAllData, importAllData } from '@/lib/db';
import '@/widgets/registry';

export default function App() {
  const widgets = useWorkspaceStore((s) => s.widgets);
  const resetWorkspace = useWorkspaceStore((s) => s.resetWorkspace);
  const { theme, toggle: toggleTheme, isDark } = useTheme();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setTimeout(() => document.getElementById('widget-search')?.focus(), 50);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleExport = async () => {
    const json = await exportAllData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `entrance-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      await importAllData(text);
      window.location.reload();
    };
    input.click();
  };

  return (
    <div className="h-screen flex flex-col bg-surface dark:bg-[#0d0d10] transition-colors">
      {/* Top bar */}
      <header className="flex items-center justify-between h-14 px-5 border-b border-black/[0.04] dark:border-white/[0.04] bg-white/90 dark:bg-[#0f0f14]/90 backdrop-blur-xl shrink-0 z-30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary-500 flex items-center justify-center shadow-md shadow-primary-500/25">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
            </div>
            <span className="text-sm font-bold text-ink dark:text-neutral-100 tracking-tight">Entrance</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <kbd className="text-2xs text-ink-hint dark:text-neutral-500 bg-surface-100 dark:bg-white/[0.04] px-2 py-0.5 rounded-lg border border-surface-200 dark:border-white/[0.04] flex items-center gap-1">
            <Command size={10} />K 搜索
          </kbd>

          <div className="w-px h-4 bg-black/[0.06] dark:bg-white/[0.06] mx-0.5" />

          <button onClick={toggleTheme} className="p-2 rounded-xl text-ink-muted dark:text-neutral-400 hover:text-ink dark:hover:text-neutral-200 hover:bg-surface-100 dark:hover:bg-white/[0.06] transition-all" title={isDark ? '浅色模式' : '深色模式'}>
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {widgets.length > 0 && (
            <>
              <button onClick={handleExport} className="p-2 rounded-xl text-ink-muted dark:text-neutral-400 hover:text-ink dark:hover:text-neutral-200 hover:bg-surface-100 dark:hover:bg-white/[0.06] transition-all" title="导出数据">
                <Download size={14} />
              </button>
              <button onClick={handleImport} className="p-2 rounded-xl text-ink-muted dark:text-neutral-400 hover:text-ink dark:hover:text-neutral-200 hover:bg-surface-100 dark:hover:bg-white/[0.06] transition-all" title="导入数据">
                <Upload size={14} />
              </button>
              <button onClick={() => { if (confirm('确定清空工作区？')) resetWorkspace(); }} className="p-2 rounded-xl text-ink-hint dark:text-neutral-600 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-all" title="清空工作区">
                <RotateCcw size={14} />
              </button>
            </>
          )}
        </div>
      </header>

      {/* Three-column body - fixed width */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Todo panel */}
        <div className="w-[360px] shrink-0 border-r border-black/[0.04] dark:border-white/[0.04] bg-surface-50 dark:bg-[#0f0f14]">
          <TodoPanel />
        </div>

        {/* Center: Workspace */}
        <div className="flex-1 overflow-auto">
          <Workspace />
        </div>

        {/* Right: Widget library */}
        <div className="w-[360px] shrink-0 border-l border-black/[0.04] dark:border-white/[0.04] bg-surface-50 dark:bg-[#0f0f14]">
          <WidgetLibrary onClose={() => {}} />
        </div>
      </div>
    </div>
  );
}
