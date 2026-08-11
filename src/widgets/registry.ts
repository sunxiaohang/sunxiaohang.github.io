/**
 * Built-in widget registration.
 * Import this file once (in App.tsx) to register all default widgets.
 * To add a new widget: create a folder under widgets/, export a manifest,
 * then import and add it to the array below.
 */
import { widgetRegistry } from '@/core/registry/WidgetRegistry';
import { clockManifest } from './clock';
import { bookmarksManifest } from './bookmarks';

import { ideasManifest } from './ideas';
import { toolsManifest } from './tools';
import { quickNoteManifest } from './quick-note';
import { quickLinksManifest } from './quick-links';

const builtInWidgets = [
  clockManifest,
  bookmarksManifest,
  ideasManifest,
  toolsManifest,
  quickNoteManifest,
  quickLinksManifest,
];

builtInWidgets.forEach((manifest) => widgetRegistry.register(manifest));
