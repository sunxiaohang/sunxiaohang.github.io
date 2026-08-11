import { useState, useMemo } from 'react';
import { Plus, Trash2, Circle, CheckCircle2, ListTodo } from 'lucide-react';
import { useWidgetData } from '@/hooks/useWidgetData';
import { nanoid } from '@/lib/utils';
import type { WidgetProps } from '@/core/registry/types';
import type { TodoItem, TodoData, Priority } from './types';

const defaultData: TodoData = { tasks: [] };
const pc: Record<Priority, { color: string; bg: string; label: string }> = {
  low: { color: 'text-ink-hint dark:text-neutral-500', bg: 'bg-surface-200 dark:bg-white/[0.04]', label: '低' },
  medium: { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-400/10', label: '中' },
  high: { color: 'text-primary-600 dark:text-primary-400', bg: 'bg-primary-50 dark:bg-primary-500/10', label: '高' },
};

export default function TodoWidget({}: WidgetProps) {
  const [data, setData, loading] = useWidgetData<TodoData>('todo-grid', defaultData);
  const [newText, setNewText] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const sorted = useMemo(() => {
    const f = (() => { switch (filter) { case 'active': return data.tasks.filter((t) => !t.completed); case 'completed': return data.tasks.filter((t) => t.completed); default: return data.tasks; } })();
    return [...f].sort((a, b) => { if (a.completed !== b.completed) return a.completed ? 1 : -1; const o = { high: 0, medium: 1, low: 2 }; return o[a.priority] - o[b.priority]; });
  }, [data.tasks, filter]);
  const activeCount = data.tasks.filter((t) => !t.completed).length;
  const completedCount = data.tasks.filter((t) => t.completed).length;

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-5 h-5 border-2 border-surface-300 dark:border-white/[0.08] border-t-primary-500 rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex gap-2">
        <input type="text" placeholder="添加新任务..." value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && newText.trim()) { const t = { id: nanoid(), text: newText.trim(), completed: false, priority: 'medium' as Priority, createdAt: new Date().toISOString() }; setData((prev: TodoData) => ({ tasks: [t, ...prev.tasks] })); setNewText(''); } }}
          className="flex-1 mdc-input" />
        <button onClick={() => { const text = newText.trim(); if (!text) return; const t = { id: nanoid(), text, completed: false, priority: 'medium' as Priority, createdAt: new Date().toISOString() }; setData((prev: TodoData) => ({ tasks: [t, ...prev.tasks] })); setNewText(''); }}
          className="mdc-btn px-3.5 shrink-0"><Plus size={16} /></button>
      </div>

      <div className="flex items-center gap-1.5">
        {(['all', 'active', 'completed'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`mdc-chip ${filter === f ? 'mdc-chip-active' : ''}`}>
            {f === 'all' ? `全部 ${data.tasks.length}` : f === 'active' ? `待完成 ${activeCount}` : `已完成 ${completedCount}`}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-0.5">
        {sorted.length === 0 && (
          <div className="text-center py-10">
            <ListTodo size={28} className="mx-auto text-surface-300 dark:text-neutral-700 mb-3" />
            <p className="text-body-sm text-ink-hint dark:text-neutral-500">{filter === 'completed' ? '还没有完成的任务' : '任务列表为空'}</p>
          </div>
        )}
        {sorted.map((task) => (
          <div key={task.id} className={`flex items-center gap-3 px-3 py-3 rounded-xl group transition-all hover:bg-surface-100 dark:hover:bg-white/[0.02] ${task.completed ? 'opacity-40' : ''}`}>
            <button onClick={() => setData({ tasks: data.tasks.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t)) })} className="shrink-0 text-surface-300 dark:text-neutral-700 hover:text-primary-500 dark:hover:text-primary-400 transition-colors">
              {task.completed ? <CheckCircle2 size={19} className="text-emerald-500" /> : <Circle size={19} />}
            </button>
            <span className={`text-body-sm flex-1 truncate ${task.completed ? 'line-through text-ink-hint dark:text-neutral-600' : 'text-ink dark:text-neutral-200 font-medium'}`}>{task.text}</span>
            {!task.completed && (
              <button onClick={() => { const o: Priority[] = ['high', 'medium', 'low']; setData({ tasks: data.tasks.map((t) => t.id === task.id ? { ...t, priority: o[(o.indexOf(task.priority) + 1) % 3] } : t) }); }}
                className={`opacity-0 group-hover:opacity-100 shrink-0 px-1.5 py-0.5 rounded-lg text-xs font-medium transition-all ${pc[task.priority].color} ${pc[task.priority].bg}`}>{pc[task.priority].label}</button>
            )}
            <button onClick={() => setData({ tasks: data.tasks.filter((t) => t.id !== task.id) })} className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded-lg text-ink-hint dark:text-neutral-600 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-all"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
