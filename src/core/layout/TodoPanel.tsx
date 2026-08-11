import { useState, useMemo } from 'react';
import { Plus, Trash2, Circle, CheckCircle2, ListTodo, ChevronDown, Calendar, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWidgetData } from '@/hooks/useWidgetData';
import { Button } from '@/shared/ui/button';
import { nanoid } from '@/lib/utils';

type Priority = 'low' | 'medium' | 'high';
interface TodoItem { id: string; text: string; completed: boolean; priority: Priority; dueDate: string | null; note: string; createdAt: string; }
interface TodoData { tasks: TodoItem[]; }

const pc: Record<Priority, { color: string; bg: string; dot: string; label: string }> = {
  low:    { color: 'text-muted-foreground', bg: 'bg-secondary', dot: 'bg-slate-400', label: '🟢' },
  medium: { color: 'text-sunny-600 dark:text-sunny-400', bg: 'bg-sunny-50 dark:bg-sunny-400/10', dot: 'bg-sunny-500', label: '🟡' },
  high:   { color: 'text-coral-600 dark:text-coral-400', bg: 'bg-coral-50 dark:bg-coral-500/10', dot: 'bg-coral-500', label: '🔴' },
};

function groupTasks(tasks: TodoItem[]) {
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  const overdue: TodoItem[]=[], dueToday: TodoItem[]=[], dueTomorrow: TodoItem[]=[], upcoming: TodoItem[]=[], noDate: TodoItem[]=[];
  for (const t of tasks) {
    if (t.completed) continue;
    if (!t.dueDate) { noDate.push(t); continue; }
    const d = new Date(t.dueDate); d.setHours(0,0,0,0);
    if (d < today) overdue.push(t);
    else if (d.getTime()===today.getTime()) dueToday.push(t);
    else if (d.getTime()===tomorrow.getTime()) dueTomorrow.push(t);
    else upcoming.push(t);
  }
  const sorter = (a:TodoItem,b:TodoItem) => { const o={high:0,medium:1,low:2}; return o[a.priority]-o[b.priority]; };
  return { overdue:overdue.sort(sorter), dueToday:dueToday.sort(sorter), dueTomorrow:dueTomorrow.sort(sorter), upcoming:upcoming.sort(sorter), noDate:noDate.sort(sorter) };
}

function formatDue(d: string|null): string {
  if (!d) return '';
  const diff = (new Date(d).setHours(0,0,0,0) - new Date().setHours(0,0,0,0))/(86400000);
  if (diff<0) return `⚠️ 过期 ${Math.abs(diff)}天`;
  if (diff===0) return '📅 今天';
  if (diff===1) return '📅 明天';
  if (diff<7) return `${diff}天后`;
  return new Date(d).toLocaleDateString('zh-CN',{month:'short',day:'numeric'});
}

export function TodoPanel() {
  const [data, setData, loading] = useWidgetData<TodoData>('todo-panel', { tasks: [] });
  const [newText, setNewText] = useState('');
  const [filter, setFilter] = useState<'all'|'active'|'completed'>('active');
  const [expandedId, setExpandedId] = useState<string|null>(null);

  const groups = useMemo(() => groupTasks(data.tasks), [data.tasks]);
  const activeTasks = data.tasks.filter(t=>!t.completed);
  const completedTasks = data.tasks.filter(t=>t.completed);
  const progress = data.tasks.length ? Math.round((completedTasks.length/data.tasks.length)*100) : 0;

  const sorted = useMemo(() => {
    const f = (() => { switch(filter){case'active':return activeTasks;case'completed':return completedTasks;default:return data.tasks;} })();
    return [...f].sort((a,b)=>{if(a.completed!==b.completed)return a.completed?1:-1;const o={high:0,medium:1,low:2};return o[a.priority]-o[b.priority];});
  }, [data.tasks,filter,activeTasks,completedTasks]);

  const handleAdd = () => {
    const t = newText.trim(); if(!t) return;
    setData((prev:TodoData)=>({tasks:[{id:nanoid(),text:t,completed:false,priority:'medium',dueDate:null,note:'',createdAt:new Date().toISOString()},...prev.tasks]}));
    setNewText('');
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin"/></div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-lg">🎯</span>
          <h2 className="text-sm font-bold text-foreground tracking-wide">待办事项</h2>
          {activeTasks.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold ml-auto">{activeTasks.length}</span>
          )}
        </div>
        {data.tasks.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{completedTasks.length}/{data.tasks.length} 完成</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-coral-400 to-coral-500"
                initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3">
        <div className="flex gap-2">
          <input type="text" placeholder="✨ 添加新任务..." value={newText}
            onChange={e=>setNewText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleAdd();}}
            className="flex-1 h-10 px-4 bg-secondary border border-border rounded-2xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" />
          <button type="button" onClick={handleAdd} className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-2xl bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95 transition-all"><Plus size={18}/></button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 pb-3 flex gap-1.5">
        {(['active','all','completed'] as const).map(f=>(
          <button key={f} onClick={()=>setFilter(f)} className={`fun-chip ${filter===f?'fun-chip-active':''}`}>
            {f==='active'?`⏳ ${activeTasks.length}`:f==='all'?`📋 ${data.tasks.length}`:`✅ ${completedTasks.length}`}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 py-1">
        <AnimatePresence>
          {sorted.length===0 && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} className="text-center py-16">
              <span className="text-2xl">{filter==='completed'?'🏆':'📝'}</span>
              <p className="text-sm text-muted-foreground mt-2 font-medium">
                {filter==='completed'?'还没有完成任务':filter==='active'?'所有任务已完成 🎉':'还没有任务'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {filter==='active' ? (
          [{label:'⚠️ 已过期',icon:'🔴',tasks:groups.overdue,urgent:true},
           {label:'📅 今天',icon:'🟠',tasks:groups.dueToday,urgent:false},
           {label:'📅 明天',icon:'🟡',tasks:groups.dueTomorrow,urgent:false},
           {label:'即将到来',icon:'🔵',tasks:groups.upcoming,urgent:false},
           {label:'待安排',icon:'⚪',tasks:groups.noDate,urgent:false}].map(sec => (
            sec.tasks.length > 0 && (
              <div key={sec.label} className="mb-3">
                <div className={`flex items-center gap-1.5 px-1 mb-1.5 text-xs font-semibold uppercase tracking-wider ${sec.urgent?'text-coral-500':'text-muted-foreground'}`}>
                  {sec.icon} {sec.label} <span className="ml-auto">{sec.tasks.length}</span>
                </div>
                {sec.tasks.map(task=>(
                  <TaskRow key={task.id} task={task} expanded={expandedId===task.id}
                    onToggle={()=>setData((prev:TodoData)=>({tasks:prev.tasks.map(t=>t.id===task.id?{...t,completed:!t.completed}:t)}))}
                    onDelete={()=>setData((prev:TodoData)=>({tasks:prev.tasks.filter(t=>t.id!==task.id)}))}
                    onExpand={()=>setExpandedId(expandedId===task.id?null:task.id)}
                    onUpdate={(p)=>setData((prev:TodoData)=>({tasks:prev.tasks.map(t=>t.id===task.id?{...t,...p}:t)}))} />
                ))}
              </div>
            )
          ))
        ) : (
          sorted.map(task=>(
            <TaskRow key={task.id} task={task} expanded={expandedId===task.id}
              onToggle={()=>setData((prev:TodoData)=>({tasks:prev.tasks.map(t=>t.id===task.id?{...t,completed:!t.completed}:t)}))}
              onDelete={()=>setData((prev:TodoData)=>({tasks:prev.tasks.filter(t=>t.id!==task.id)}))}
              onExpand={()=>setExpandedId(expandedId===task.id?null:task.id)}
              onUpdate={(p)=>setData((prev:TodoData)=>({tasks:prev.tasks.map(t=>t.id===task.id?{...t,...p}:t)}))} />
          ))
        )}
      </div>
    </div>
  );
}

function TaskRow({task,expanded,onToggle,onDelete,onExpand,onUpdate}:{
  task:TodoItem;expanded:boolean;onToggle:()=>void;onDelete:()=>void;onExpand:()=>void;onUpdate:(p:Partial<TodoItem>)=>void;
}) {
  const p = pc[task.priority];
  return (
    <motion.div layout className={`rounded-2xl transition-colors mb-0.5 ${expanded?'bg-secondary/50':''}`}>
      <div onClick={onExpand}
        className={`flex items-center gap-3 px-3 py-3 group transition-all hover:bg-secondary/50 rounded-2xl cursor-pointer ${task.completed?'opacity-40':''}`}>
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.dot}`} />
        <button onClick={e=>{e.stopPropagation();onToggle();}} className="shrink-0 text-muted-foreground/40 hover:text-primary transition-colors">
          {task.completed?<CheckCircle2 size={19} className="text-mint-500"/>:<Circle size={19}/>}
        </button>
        <div className="flex-1 min-w-0">
          <span className={`text-sm truncate block ${task.completed?'line-through text-muted-foreground':'text-foreground font-medium'}`}>{task.text}</span>
          {task.dueDate && !task.completed && <span className={`text-xs mt-0.5 inline-flex items-center gap-1 ${new Date(task.dueDate)<new Date()?'text-coral-500 font-semibold':'text-muted-foreground'}`}>{formatDue(task.dueDate)}</span>}
        </div>
        {!task.completed && (
          <button onClick={e=>{e.stopPropagation();const o:Priority[]=['high','medium','low'];onUpdate({priority:o[(o.indexOf(task.priority)+1)%3]});}}
            className={`opacity-0 group-hover:opacity-100 shrink-0 px-1.5 py-0.5 rounded-lg text-xs font-medium transition-all ${p.color} ${p.bg}`}>{p.label}</button>
        )}
        <button onClick={e=>{e.stopPropagation();onDelete();}}
          className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded-lg text-muted-foreground hover:text-coral-500 hover:bg-coral-50 dark:hover:bg-coral-500/10 transition-all"><Trash2 size={13}/></button>
        <ChevronDown size={12} className={`text-muted-foreground transition-transform shrink-0 ${expanded?'rotate-180':''}`}/>
      </div>
      {expanded && !task.completed && (
        <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} className="px-8 pb-3 space-y-2.5 overflow-hidden">
          <div className="flex items-center gap-2">
            <Calendar size={13} className="text-muted-foreground shrink-0"/>
            <input type="date" value={task.dueDate||''} onChange={e=>onUpdate({dueDate:e.target.value||null})}
              className="text-xs bg-transparent text-foreground/70 focus:outline-none cursor-pointer"/>
            {task.dueDate && <button onClick={e=>{e.stopPropagation();onUpdate({dueDate:null});}} className="p-0.5 rounded text-muted-foreground hover:text-coral-500"><X size={11}/></button>}
          </div>
          <textarea placeholder="📝 添加备注..." value={task.note} onChange={e=>onUpdate({note:e.target.value})} onClick={e=>e.stopPropagation()} rows={2}
            className="w-full text-xs bg-secondary border border-border/50 rounded-2xl p-2.5 text-foreground/70 placeholder:text-muted-foreground focus:outline-none focus:border-primary/30 resize-none transition-colors"/>
        </motion.div>
      )}
    </motion.div>
  );
}
