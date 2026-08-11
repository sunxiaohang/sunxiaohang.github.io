import { widgetRegistry } from '@/core/registry/WidgetRegistry';
import { clockManifest } from './clock';
import { ideasManifest } from './ideas';
import { quickNoteManifest } from './quick-note';
import { quickLinksManifest } from './quick-links';

const builtInWidgets = [
  clockManifest,
  ideasManifest,
  quickNoteManifest,
  quickLinksManifest,
];

builtInWidgets.forEach((manifest) => widgetRegistry.register(manifest));
