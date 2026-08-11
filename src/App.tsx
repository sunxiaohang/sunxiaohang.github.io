import { useState } from 'react';
import { Sun, Moon, Eye, Pen } from 'lucide-react';
import { Workspace } from '@/core/layout/Workspace';
import { InfoPanel } from '@/core/layout/InfoPanel';
import { WidgetToolbar } from '@/core/layout/WidgetToolbar';
import { TodoPanel } from '@/core/layout/TodoPanel';
import { useTheme } from '@/hooks/useTheme';
import '@/widgets/registry';

export default function App() {
  const { toggle: toggleTheme, isDark } = useTheme();
  const [editMode, setEditMode] = useState(false);

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

          <button
            onClick={() => setEditMode(!editMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              editMode
                ? 'bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400 border border-primary-200 dark:border-primary-500/20'
                : 'text-ink-muted dark:text-neutral-400 hover:text-ink dark:hover:text-neutral-200 hover:bg-surface-100 dark:hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            {editMode ? <Pen size={13} /> : <Eye size={13} />}
            {editMode ? '编辑中' : '预览'}
          </button>
        </div>

        <button onClick={toggleTheme} className="p-2 rounded-xl text-ink-muted dark:text-neutral-400 hover:text-ink dark:hover:text-neutral-200 hover:bg-surface-100 dark:hover:bg-white/[0.06] transition-all" title={isDark ? '浅色模式' : '深色模式'}>
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </header>

      {/* Three-column body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Todo */}
        <div className="w-[360px] shrink-0 border-r border-black/[0.04] dark:border-white/[0.04] bg-surface-50 dark:bg-[#0f0f14]">
          <TodoPanel />
        </div>

        {/* Center: Workspace + Toolbar */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <Workspace editMode={editMode} />
          </div>
          <WidgetToolbar editMode={editMode} />
        </div>

        {/* Right: Info cards */}
        <div className="w-[360px] shrink-0 border-l border-black/[0.04] dark:border-white/[0.04] bg-surface-50 dark:bg-[#0f0f14]">
          <InfoPanel />
        </div>
      </div>
    </div>
  );
}
