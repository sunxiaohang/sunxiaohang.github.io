import type { WidgetManifest } from '@/core/registry/types';

export const ideasManifest: WidgetManifest = {
  id: 'ideas',
  name: '灵感记录',
  description: '快速记录想法，支持标签和编辑',
  icon: 'lightbulb',
  category: 'productivity',
  defaultSize: { cols: 5, rows: 5 },
  minSize: { cols: 3, rows: 3 },
  loader: () => import('./IdeasWidget'),
};
