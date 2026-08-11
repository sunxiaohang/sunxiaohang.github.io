import type { WidgetManifest } from '@/core/registry/types';

export const quickNoteManifest: WidgetManifest = {
  id: 'quick-note',
  name: '便签',
  description: '随手记录，自动保存',
  icon: 'sticky-note',
  category: 'productivity',
  defaultSize: { cols: 3, rows: 4 },
  minSize: { cols: 2, rows: 3 },
  loader: () => import('./QuickNoteWidget'),
};
