import type { WidgetManifest } from '@/core/registry/types';

export const quickLinksManifest: WidgetManifest = {
  id: 'quick-links',
  name: '快捷链接',
  description: '常用网站快速入口，横排展示',
  icon: 'globe',
  category: 'reference',
  defaultSize: { cols: 8, rows: 2 },
  minSize: { cols: 4, rows: 1 },
  loader: () => import('./QuickLinksWidget'),
};
