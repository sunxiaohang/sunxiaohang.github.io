import type { WidgetManifest } from '@/core/registry/types';

export const toolsManifest: WidgetManifest = {
  id: 'tools',
  name: '工具集',
  description: '常用工具和应用入口导航',
  icon: 'wrench',
  category: 'reference',
  defaultSize: { cols: 4, rows: 5 },
  minSize: { cols: 3, rows: 3 },
  loader: () => import('./ToolsWidget'),
};
