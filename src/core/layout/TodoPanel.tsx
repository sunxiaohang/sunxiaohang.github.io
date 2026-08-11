import { useState, useMemo } from 'react';
import {
  Plus, Trash2, Circle, CheckCircle2, ListTodo, Calendar, ChevronDown,
  AlertCircle, Clock, Flag, X, RotateCcw,
} from 'lucide-react';
import { useWidgetData } from '@/hooks/useWidgetData';
import { nanoid } from '@/lib/utils';

type Priority = 'low' | 'medium' | 'high';

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  priority: Priority;
  dueDate: string | null;       // ISO date string
  note: string;
  createdAt: string;
}

interface TodoData { tasks: TodoItem[]; }

const pc: Record<Priority, { color: string; bg: string; dot: string; label: string }> = {
  low:    { color: 'text-ink-muted dark:text-neutral-500',    bg: 'bg-surface-100 dark:bg-white/[0.03]',     dot: 'bg-slate-400',   label: '低' },
  medium: { color: 'text-amber-600 dark:text-amber-400',      bg: 'bg-amber-50 dark:bg-amber-400/10',        dot: 'bg-amber-500',   label: '中' },
  high:   { color: 'text-primary-600 dark:text-primary-400',  bg: 'bg-primary-50 dark:bg-primary-500/10',    dot: 'bg-primary-500', label: '高' },
};

/** Group tasks by due-date status */
function groupTasks(tasks: TodoItem[]) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const overdue: TodoItem[] = [];
  const dueToday: TodoItem[] = [];
  const dueTomorrow: TodoItem[] = [];
  const upcoming: TodoItem[] = [];
  const noDate: TodoItem[] = [];

  for (const t of tasks) {
    if (t.completed) continue;
    if (!t.dueDate) { noDate.push(t); continue; }

    const d = new Date(t.dueDate); d.setHours(0, 0, 0, 0);
    if (d < today) overdue.push(t);
    else if (d.getTime() === today.getTime()) dueToday.push(t);
    else if (d.getTime() === tomorrow.getTime()) dueTomorrow.push(t);
    else upcoming.push(t);
  }

  // Sort each group: high > medium > low
  const sorter = (a: TodoItem, b: TodoItem) => {
    const o = { high: 0, medium: 1, low: 2 };
    return o[a.priority] - o[b.priority];
  };

  return {
    overdue: overdue.sort(sorter),
    dueToday: dueToday.sort(sorter),
    dueTomorrow: dueTomorrow.sort(sorter),
    upcoming: upcoming.sort(sorter),
    noDate: noDate.sort(sorter),
  };
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d < today;
}

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return '';
  const d = new Date(dueDate); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

  if (diff < 0) return `已过期 ${Math.abs(diff)} 天`;
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff < 7) return `${diff} 天后`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function TodoPanel() {
  const [data, setData, loading] = useWidgetData<TodoData>('todo-panel', { tasks: [] });
  const [newText, setNewText] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // ALL hooks before early return
  const groups = useMemo(() => groupTasks(data.tasks), [data.tasks]);
  const activeTasks = data.tasks.filter((t) => !t.completed);
  const completedTasks = data.tasks.filter((t) => t.completed);
  const progress = data.tasks.length > 0
    ? Math.round((completedTasks.length / data.tasks.length) * 100)
    : 0;

  // Flattened sorted list for non-active filters
  const sorted = useMemo(() => {
    const f = (() => {
      switch (filter) { case 'active': return activeTasks; case 'completed': return completedTasks; default: return data.tasks; }
    })();
    return [...f].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const o = { high: 0, medium: 1, low: 2 };
      return o[a.priority] - o[b.priority];
    });
  }, [data.tasks, filter, activeTasks, completedTasks]);

  const handleAdd = () => {
    const text = newText.trim();
    if (!text) return;
    const task: TodoItem = { id: nanoid(), text, completed: false, priority: 'medium', dueDate: null, note: '', createdAt: new Date().toISOString() };
    setData((prev: TodoData) => ({ tasks: [task, ...prev.tasks] }));
    setNewText('');
  };

  const handleToggle = (id: string) => {
    setData((prev: TodoData) => ({ tasks: prev.tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)) }));
  };

  const handleDelete = (id: string) => {
    setData((prev: TodoData) => ({ tasks: prev.tasks.filter((t) => t.id !== id) }));
  };

  const handleUpdate = (id: string, patch: Partial<TodoItem>) => {
    setData((prev: TodoData) => ({ tasks: prev.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-5 h-5 border-2 border-surface-300 dark:border-white/[0.08] border-t-primary-500 rounded-full animate-spin" /></div>;

  // ---- Render active view (grouped by date) ----
  const renderActiveView = () => {
    const sections: { label: string; icon: React.ReactNode; tasks: TodoItem[]; urgent: boolean }[] = [
      { label: '已过期', icon: <AlertCircle size={13} />, tasks: groups.overdue, urgent: true },
      { label: '今天', icon: <Clock size={13} />, tasks: groups.dueToday, urgent: false },
      { label: '明天', icon: <Calendar size={13} />, tasks: groups.dueTomorrow, urgent: false },
      { label: '即将到来', icon: <Calendar size={13} />, tasks: groups.upcoming, urgent: false },
      { label: '待安排', icon: <Flag size={13} />, tasks: groups.noDate, urgent: false },
    ];

    return sections.map((sec) => {
      if (sec.tasks.length === 0) return null;
      return (
        <div key={sec.label} className="mb-3">
          <div className={`flex items-center gap-1.5 px-1 mb-1.5 text-xs font-semibold uppercase tracking-wider ${sec.urgent ? 'text-primary-500' : 'text-ink-muted dark:text-neutral-500'}`}>
            {sec.icon}
            <span>{sec.label}</span>
            <span className="ml-auto text-ink-hint dark:text-neutral-600">{sec.tasks.length}</span>
          </div>
          {sec.tasks.map((task) => (
            <TodoRow
              key={task.id}
              task={task}
              expanded={expandedId === task.id}
              onToggle={() => handleToggle(task.id)}
              onDelete={() => handleDelete(task.id)}
              onExpand={() => setExpandedId(expandedId === task.id ? null : task.id)}
              onUpdate={(p) => handleUpdate(task.id, p)}
            />
          ))}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with progress */}
      <div className="px-5 py-4 border-b border-black/[0.04] dark:border-white/[0.04]">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 rounded-lg bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center">
            <ListTodo size={16} className="text-primary-500" />
          </div>
          <h2 className="text-sm font-bold text-ink dark:text-neutral-100 tracking-wide">待办事项</h2>
          {activeTasks.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400 font-bold ml-auto">
              {activeTasks.length}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {data.tasks.length > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-ink-hint dark:text-neutral-500">
              <span>{completedTasks.length}/{data.tasks.length} 已完成</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-200 dark:bg-white/[0.05] overflow-hidden">
              <div
                className="h-full rounded-full bg-primary-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3">
        <div className="flex gap-2">
          <input type="text" placeholder="添加新任务..." value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            className="flex-1 mdc-input" />
          <button onClick={handleAdd} className="mdc-btn px-3.5 shrink-0"><Plus size={16} /></button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-4 pb-3 flex gap-1.5">
        {(['active', 'all', 'completed'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`mdc-chip ${filter === f ? 'mdc-chip-active' : ''}`}>
            {f === 'active' ? `待完成${activeTasks.length ? ` ${activeTasks.length}` : ''}` : f === 'all' ? `全部${data.tasks.length ? ` ${data.tasks.length}` : ''}` : `已完成${completedTasks.length ? ` ${completedTasks.length}` : ''}`}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-3 py-1">
        {sorted.length === 0 && (
          <div className="text-center py-16">
            <CheckCircle2 size={32} className="mx-auto text-surface-300 dark:text-neutral-800 mb-3" />
            <p className="text-body-sm text-ink-hint dark:text-neutral-500 font-medium">
              {filter === 'completed' ? '还没有完成的任务' : filter === 'active' ? '所有任务已完成 🎉' : '还没有任务'}
            </p>
            <p className="text-xs text-ink-hint dark:text-neutral-600 mt-1">
              {filter === 'active' ? '在上面输入新任务开始吧' : ''}
            </p>
          </div>
        )}

        {/* Grouped view for active filter, flat for others */}
        {filter === 'active'
          ? renderActiveView()
          : sorted.map((task) => (
            <TodoRow
              key={task.id}
              task={task}
              expanded={expandedId === task.id}
              onToggle={() => handleToggle(task.id)}
              onDelete={() => handleDelete(task.id)}
              onExpand={() => setExpandedId(expandedId === task.id ? null : task.id)}
              onUpdate={(p) => handleUpdate(task.id, p)}
            />
          ))
        }
      </div>

      {/* Footer: restore completed hint */}
      {completedTasks.length > 0 && filter !== 'completed' && (
        <div className="px-4 py-2 border-t border-black/[0.04] dark:border-white/[0.04]">
          <button
            onClick={() => setFilter('completed')}
            className="flex items-center gap-1.5 text-xs text-ink-hint dark:text-neutral-500 hover:text-ink dark:hover:text-neutral-300 transition-colors w-full"
          >
            <RotateCcw size={11} />
            查看已完成 ({completedTasks.length})
          </button>
        </div>
      )}
    </div>
  );
}

/** Single task row with expandable note */
function TodoRow({
  task, expanded, onToggle, onDelete, onExpand, onUpdate,
}: {
  task: TodoItem;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onExpand: () => void;
  onUpdate: (patch: Partial<TodoItem>) => void;
}) {
  const overdue = isOverdue(task.dueDate);
  const p = pc[task.priority];

  return (
    <div className={`rounded-xl transition-all mb-0.5 ${expanded ? 'bg-surface-100 dark:bg-white/[0.02]' : ''}`}>
      {/* Main row */}
      <div
        className={`flex items-center gap-3 px-3 py-3 group transition-all hover:bg-surface-100 dark:hover:bg-white/[0.02] rounded-xl cursor-pointer ${task.completed ? 'opacity-40' : ''}`}
        onClick={onExpand}
      >
        {/* Priority dot */}
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.dot}`} title={p.label} />

        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="shrink-0 text-surface-300 dark:text-neutral-700 hover:text-primary-500 dark:hover:text-primary-400 transition-colors"
        >
          {task.completed ? <CheckCircle2 size={19} className="text-emerald-500" /> : <Circle size={19} />}
        </button>

        {/* Text + meta */}
        <div className="flex-1 min-w-0">
          <span className={`text-body-sm truncate block ${task.completed ? 'line-through text-ink-hint dark:text-neutral-600' : 'text-ink dark:text-neutral-200 font-medium'}`}>
            {task.text}
          </span>
          {task.dueDate && !task.completed && (
            <span className={`text-xs mt-0.5 inline-flex items-center gap-1 ${overdue ? 'text-primary-500 font-semibold' : 'text-ink-hint dark:text-neutral-500'}`}>
              <Calendar size={10} />
              {formatDueDate(task.dueDate)}
            </span>
          )}
        </div>

        {/* Priority badge */}
        {!task.completed && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const o: Priority[] = ['high', 'medium', 'low'];
              onUpdate({ priority: o[(o.indexOf(task.priority) + 1) % 3] });
            }}
            className={`opacity-0 group-hover:opacity-100 shrink-0 px-1.5 py-0.5 rounded-lg text-xs font-medium transition-all ${p.color} ${p.bg}`}
          >
            {p.label}
          </button>
        )}

        {/* Note indicator */}
        {task.note && (
          <span className="text-ink-hint dark:text-neutral-600 shrink-0">
            <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </span>
        )}

        {!task.note && (
          <span className="opacity-0 group-hover:opacity-100 shrink-0">
            <ChevronDown size={12} className={`text-ink-hint dark:text-neutral-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </span>
        )}

        {/* Delete */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded-lg text-ink-hint dark:text-neutral-700 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-all"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Expanded area: note + due date */}
      {expanded && !task.completed && (
        <div className="px-8 pb-3 space-y-2.5 animate-fade-in">
          {/* Due date picker */}
          <div className="flex items-center gap-2">
            <Calendar size={13} className="text-ink-hint dark:text-neutral-500 shrink-0" />
            <input
              type="date"
              value={task.dueDate || ''}
              onChange={(e) => onUpdate({ dueDate: e.target.value || null })}
              className="text-xs bg-transparent text-ink-secondary dark:text-neutral-300 focus:outline-none cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            />
            {task.dueDate && (
              <button
                onClick={(e) => { e.stopPropagation(); onUpdate({ dueDate: null }); }}
                className="p-0.5 rounded text-ink-hint dark:text-neutral-600 hover:text-primary-500"
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* Note input */}
          <textarea
            placeholder="添加备注..."
            value={task.note}
            onChange={(e) => onUpdate({ note: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            rows={2}
            className="w-full text-xs bg-surface-50 dark:bg-white/[0.02] border border-surface-200 dark:border-white/[0.04] rounded-xl p-2.5 text-ink-secondary dark:text-neutral-300 placeholder:text-ink-hint dark:placeholder:text-neutral-600 focus:outline-none focus:border-primary-300 dark:focus:border-primary-500/30 resize-none transition-colors"
          />
        </div>
      )}
    </div>
  );
}
