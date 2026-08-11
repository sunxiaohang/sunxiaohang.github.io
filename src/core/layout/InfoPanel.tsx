import { useWidgetData } from '@/hooks/useWidgetData';
import { ExternalLink, Lightbulb, Bookmark, StickyNote, Sparkles } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface BookmarkItem { id: string; title: string; url: string; category: string; icon?: string; createdAt: string; }
interface IdeaNote { id: string; title: string; content: string; tags: string[]; createdAt: string; updatedAt: string; }
interface QuickNoteData { content: string; updatedAt: string; }

function getFavicon(url: string): string {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; } catch { return ''; }
}

export function InfoPanel() {
  const [bookmarkData] = useWidgetData<{ bookmarks: BookmarkItem[] }>('bookmarks-main', { bookmarks: [] });
  const [ideasData] = useWidgetData<{ notes: IdeaNote[] }>('ideas-main', { notes: [] });
  const [noteData] = useWidgetData<QuickNoteData>('quick-note-main', { content: '', updatedAt: '' });

  const recentBookmarks = bookmarkData.bookmarks.slice(0, 4);
  const recentIdeas = [...ideasData.notes]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3);
  const hasNote = noteData.content.trim().length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-black/[0.04] dark:border-white/[0.04]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center">
            <Sparkles size={16} className="text-primary-500" />
          </div>
          <h2 className="text-sm font-bold text-ink dark:text-neutral-100 tracking-wide">信息卡</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Bookmarks section */}
        {recentBookmarks.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Bookmark size={13} className="text-blue-500" />
              <h3 className="text-xs font-semibold text-ink-muted dark:text-neutral-400 uppercase tracking-wider">书签</h3>
            </div>
            <div className="space-y-1">
              {recentBookmarks.map((bm) => (
                <a
                  key={bm.id}
                  href={bm.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-surface-100 dark:hover:bg-white/[0.02] transition-all group no-underline border border-transparent hover:border-surface-200 dark:hover:border-white/[0.04]"
                >
                  <img
                    src={bm.icon || getFavicon(bm.url)}
                    alt=""
                    className="w-5 h-5 rounded shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <span className="text-body-sm text-ink-secondary dark:text-neutral-300 truncate flex-1 group-hover:text-primary-500 dark:group-hover:text-primary-400 transition-colors font-medium">
                    {bm.title}
                  </span>
                  <ExternalLink size={11} className="text-ink-hint dark:text-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Ideas section */}
        {recentIdeas.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Lightbulb size={13} className="text-amber-500" />
              <h3 className="text-xs font-semibold text-ink-muted dark:text-neutral-400 uppercase tracking-wider">灵感</h3>
            </div>
            <div className="space-y-1.5">
              {recentIdeas.map((idea) => (
                <div
                  key={idea.id}
                  className="px-3.5 py-3 rounded-xl bg-surface-50 dark:bg-white/[0.015] border border-surface-200 dark:border-white/[0.03]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-body-sm font-semibold text-ink dark:text-neutral-200 truncate">
                      {idea.title || '无标题'}
                    </span>
                    <span className="text-2xs text-ink-hint dark:text-neutral-600 shrink-0">
                      {formatDate(idea.updatedAt)}
                    </span>
                  </div>
                  {idea.content && (
                    <p className="text-xs text-ink-muted dark:text-neutral-500 mt-1.5 line-clamp-2 leading-relaxed">
                      {idea.content}
                    </p>
                  )}
                  {idea.tags.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {idea.tags.map((t) => (
                        <span key={t} className="text-2xs px-1.5 py-0.5 rounded-md bg-surface-100 dark:bg-white/[0.03] text-ink-hint dark:text-neutral-500 border border-surface-200 dark:border-white/[0.03]">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quick note section */}
        {hasNote && (
          <section>
            <div className="flex items-center gap-1.5 mb-2.5">
              <StickyNote size={13} className="text-purple-500" />
              <h3 className="text-xs font-semibold text-ink-muted dark:text-neutral-400 uppercase tracking-wider">便签</h3>
            </div>
            <div className="px-3.5 py-3 rounded-xl bg-purple-50/30 dark:bg-purple-500/[0.03] border border-purple-100 dark:border-purple-500/10">
              <p className="text-body-sm text-ink-secondary dark:text-neutral-300 leading-relaxed whitespace-pre-wrap line-clamp-4">
                {noteData.content}
              </p>
            </div>
          </section>
        )}

        {/* Empty state */}
        {recentBookmarks.length === 0 && recentIdeas.length === 0 && !hasNote && (
          <div className="flex items-center justify-center h-40">
            <div className="text-center space-y-2">
              <Sparkles size={24} className="mx-auto text-surface-300 dark:text-neutral-700" />
              <p className="text-body-sm text-ink-hint dark:text-neutral-500">
                添加书签、灵感或便签后<br />这里会自动展示
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
