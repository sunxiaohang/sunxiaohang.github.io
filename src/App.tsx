import { useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Workspace } from '@/core/layout/Workspace';
import { InfoPanel } from '@/core/layout/InfoPanel';
import { StatusBar } from '@/core/layout/StatusBar';
import { WidgetDrawer } from '@/core/layout/WidgetDrawer';
import { TodoPanel } from '@/core/layout/TodoPanel';
import { useTheme } from '@/hooks/useTheme';
import '@/widgets/registry';

export default function App() {
  const { toggle: toggleTheme, isDark } = useTheme();
  const [editMode, setEditMode] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-background transition-colors">
      {/* Top bar */}
      <header className="flex items-center justify-between h-14 px-5 border-b border-border/50 bg-card/80 backdrop-blur-xl shrink-0 z-30">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-coral-400 to-coral-500 flex items-center justify-center shadow-md shadow-coral-500/25">
            <span className="text-white text-sm">🏠</span>
          </div>
          <span className="text-sm font-bold text-foreground tracking-tight">Entrance</span>
        </motion.div>

        <button onClick={toggleTheme} className="p-2 rounded-2xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all" title={isDark ? '☀️' : '🌙'}>
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </header>

      {/* Three-column body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Todo 🎯 */}
        <div className="w-[360px] shrink-0 border-r border-border/50 bg-card/50">
          <TodoPanel />
        </div>

        {/* Center: Workspace + StatusBar */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <Workspace editMode={editMode} />
          </div>
          <StatusBar
            editMode={editMode}
            onToggleEdit={() => setEditMode(!editMode)}
            onOpenDrawer={() => setDrawerOpen(true)}
          />
        </div>

        {/* Right: Info cards ✨ */}
        <div className="w-[360px] shrink-0 border-l border-border/50 bg-card/50">
          <InfoPanel />
        </div>
      </div>

      {/* Widget drawer */}
      <WidgetDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
