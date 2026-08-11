import type { ComponentType, LazyExoticComponent } from 'react';

/** Category for organizing widgets in the library sidebar */
export type WidgetCategory = 'productivity' | 'reference' | 'info' | 'custom';

/** Configuration field definition for widget settings */
export interface WidgetSetting {
  key: string;
  label: string;
  type: 'text' | 'number' | 'toggle' | 'select';
  defaultValue: unknown;
  options?: { label: string; value: string }[];
}

/** Props passed to every widget component */
export interface WidgetProps {
  instanceId: string;
  config: Record<string, unknown>;
}

/** Manifest that every widget must export */
export interface WidgetManifest {
  /** Unique identifier, e.g. "todo" */
  id: string;
  /** Display name, e.g. "待办事项" */
  name: string;
  /** Description shown in library tooltip */
  description: string;
  /** Lucide icon name */
  icon: string;
  /** Widget library category */
  category: WidgetCategory;
  /** Default grid size when first added */
  defaultSize: { cols: number; rows: number };
  /** Minimum grid size */
  minSize: { cols: number; rows: number };
  /** Dynamic import loader for the widget component */
  loader: () => Promise<{ default: ComponentType<WidgetProps> }>;
  /** Optional settings schema */
  settingsSchema?: WidgetSetting[];
}

/** Runtime instance of a widget on the workspace */
export interface WidgetLayout {
  /** Unique runtime ID (uuid) */
  instanceId: string;
  /** References WidgetManifest.id */
  widgetId: string;
  /** Grid column position */
  x: number;
  /** Grid row position */
  y: number;
  /** Grid column span */
  cols: number;
  /** Grid row span */
  rows: number;
  /** Widget-specific configuration */
  config: Record<string, unknown>;
}
