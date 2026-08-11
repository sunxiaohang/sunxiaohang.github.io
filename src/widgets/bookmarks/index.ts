import type { WidgetManifest } from '@/core/registry/types';

export const bookmarksManifest: WidgetManifest = {
  id: 'bookmarks',
  name: '书签',
  description: '常用网站链接收藏，分类管理',
  icon: 'bookmark',
  category: 'reference',
  defaultSize: { cols: 4, rows: 5 },
  minSize: { cols: 3, rows: 3 },
  loader: () => import('./BookmarksWidget'),
};
