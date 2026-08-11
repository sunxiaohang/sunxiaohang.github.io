import type { WidgetManifest } from './types';

/**
 * Central widget registry.
 * Widgets register their manifests here; the workspace and sidebar query the
 * registry to discover available widgets.
 */
class WidgetRegistry {
  private widgets = new Map<string, WidgetManifest>();

  /** Register a widget manifest */
  register(manifest: WidgetManifest): void {
    if (this.widgets.has(manifest.id)) {
      console.warn(`Widget "${manifest.id}" is already registered, overwriting.`);
    }
    this.widgets.set(manifest.id, manifest);
  }

  /** Get a single manifest by ID */
  get(id: string): WidgetManifest | undefined {
    return this.widgets.get(id);
  }

  /** Get all registered manifests */
  getAll(): WidgetManifest[] {
    return Array.from(this.widgets.values());
  }

  /** Get manifests filtered by category */
  getByCategory(category: string): WidgetManifest[] {
    return this.getAll().filter((w) => w.category === category);
  }

  /** Check if a widget ID exists */
  has(id: string): boolean {
    return this.widgets.has(id);
  }

  /** Remove a widget from the registry */
  unregister(id: string): void {
    this.widgets.delete(id);
  }
}

/** Singleton instance */
export const widgetRegistry = new WidgetRegistry();
