import type { WidgetManifest } from '@/core/registry/types';

export const todoManifest: WidgetManifest = {
  id: 'todo',
  name: '待办事项',
  description: '任务管理，左侧面板已有一个，可额外添加',
  icon: 'check-check',
  category: 'productivity',
  defaultSize: { cols: 4, rows: 5 },
  minSize: { cols: 3, rows: 3 },
  loader: () => import('./TodoWidget'),
};
