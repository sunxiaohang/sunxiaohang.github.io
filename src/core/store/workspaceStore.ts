import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { WidgetLayout } from '../registry/types';
import { widgetRegistry } from '../registry/WidgetRegistry';

interface WorkspaceState {
  widgets: WidgetLayout[];

  addWidget: (widgetId: string) => void;
  removeWidget: (instanceId: string) => void;
  updateLayout: (layouts: Array<{ i: string; x: number; y: number; w: number; h: number }>) => void;
  updateWidgetConfig: (instanceId: string, config: Record<string, unknown>) => void;
  resetWorkspace: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      widgets: [],

      addWidget: (widgetId: string) => {
        const manifest = widgetRegistry.get(widgetId);
        if (!manifest) {
          console.warn(`Widget "${widgetId}" not found in registry`);
          return;
        }

        const existing = get().widgets;
        const offset = existing.length % 3;
        const x = (offset * 4) % 12;
        const y = existing.length * 2;

        const newWidget: WidgetLayout = {
          instanceId: uuidv4(),
          widgetId,
          x,
          y,
          cols: manifest.defaultSize.cols,
          rows: manifest.defaultSize.rows,
          config: {},
        };

        set({ widgets: [...existing, newWidget] });
      },

      removeWidget: (instanceId: string) => {
        set({ widgets: get().widgets.filter((w) => w.instanceId !== instanceId) });
      },

      updateLayout: (layouts) => {
        set({
          widgets: get().widgets.map((w) => {
            const updated = layouts.find((l) => l.i === w.instanceId);
            if (updated) {
              return { ...w, x: updated.x, y: updated.y, cols: updated.w, rows: updated.h };
            }
            return w;
          }),
        });
      },

      updateWidgetConfig: (instanceId, config) => {
        set({
          widgets: get().widgets.map((w) =>
            w.instanceId === instanceId ? { ...w, config } : w
          ),
        });
      },

      resetWorkspace: () => set({ widgets: [] }),
    }),
    {
      name: 'entrance-workspace',
      version: 2,
    }
  )
);
