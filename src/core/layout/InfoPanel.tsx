import { useWidgetData } from '@/hooks/useWidgetData';
import { motion } from 'framer-motion';
import { formatDate } from '@/lib/utils';

interface IdeaNote { id: string; title: string; content: string; tags: string[]; createdAt: string; updatedAt: string; }
interface QuickNoteData { content: string; updatedAt: string; }

export function InfoPanel() {
  const [ideasData] = useWidgetData<{ notes: IdeaNote[] }>('ideas-main', { notes: [] });
  const [noteData] = useWidgetData<QuickNoteData>('quick-note-main', { content: '', updatedAt: '' });

  const recentIdeas = [...ideasData.notes]
    .sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4);
  const hasNote = noteData.content.trim().length > 0;
  const isEmpty = recentIdeas.length === 0 && !hasNote;

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">✨</span>
          <h2 className="text-sm font-bold text-foreground tracking-wide">信息卡</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {isEmpty && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center h-40 text-center space-y-3">
            <span className="text-3xl">🌟</span>
            <p className="text-sm text-muted-foreground">添加灵感或便签后<br/>这里会自动展示</p>
          </motion.div>
        )}

        {recentIdeas.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-1.5 mb-2.5">
              <span className="text-xs">💡</span>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">灵感</h3>
            </div>
            <div className="space-y-2">
              {recentIdeas.map((idea) => (
                <div key={idea.id} className="px-3.5 py-3 rounded-2xl bg-gradient-to-br from-lavender-50 to-lavender-50/30 dark:from-lavender-500/5 dark:to-transparent border border-lavender-100 dark:border-lavender-500/10">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{idea.title || '无标题'}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatDate(idea.updatedAt)}</span>
                  </div>
                  {idea.content && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">{idea.content}</p>}
                  {idea.tags.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {idea.tags.map(t=><span key={t} className="text-xs px-1.5 py-0.5 rounded-lg bg-lavender-100 dark:bg-lavender-500/10 text-lavender-600 dark:text-lavender-400">{t}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {hasNote && (
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="flex items-center gap-1.5 mb-2.5">
              <span className="text-xs">📝</span>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">便签</h3>
            </div>
            <div className="px-3.5 py-3 rounded-2xl bg-gradient-to-br from-sunny-50 to-sunny-50/30 dark:from-sunny-500/5 dark:to-transparent border border-sunny-100 dark:border-sunny-500/10">
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap line-clamp-4">{noteData.content}</p>
            </div>
          </motion.section>
        )}
      </div>
    </div>
  );
}
