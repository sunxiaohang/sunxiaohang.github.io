import type { WidgetManifest } from '@/core/registry/types';

export const clockManifest: WidgetManifest = {
  id: 'clock',
  name: '时钟',
  description: '显示当前时间和日期，今日进度环',
  icon: 'clock',
  category: 'info',
  defaultSize: { cols: 3, rows: 4 },
  minSize: { cols: 2, rows: 3 },
  loader: () => import('./ClockWidget'),
};
