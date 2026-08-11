import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'entrance-data';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase | null = null;

/** Get (or create) the IndexedDB database instance */
export async function getDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('widget-data')) {
        db.createObjectStore('widget-data');
      }
    },
  });

  return dbInstance;
}

/** Read widget data by instance ID */
export async function readWidgetData<T = unknown>(instanceId: string): Promise<T | undefined> {
  const db = await getDB();
  return db.get('widget-data', instanceId) as Promise<T | undefined>;
}

/** Write widget data by instance ID */
export async function writeWidgetData<T = unknown>(instanceId: string, data: T): Promise<void> {
  const db = await getDB();
  await db.put('widget-data', data, instanceId);
}

/** Delete widget data by instance ID */
export async function deleteWidgetData(instanceId: string): Promise<void> {
  const db = await getDB();
  await db.delete('widget-data', instanceId);
}

/** Export all data as JSON */
export async function exportAllData(): Promise<string> {
  const db = await getDB();
  const allData: Record<string, unknown> = {};
  const tx = db.transaction('widget-data', 'readonly');
  let cursor = await tx.store.openCursor();
  while (cursor) {
    allData[cursor.key as string] = cursor.value;
    cursor = await cursor.continue();
  }
  await tx.done;
  return JSON.stringify(allData, null, 2);
}

/** Import data from JSON */
export async function importAllData(json: string): Promise<void> {
  const db = await getDB();
  const data = JSON.parse(json) as Record<string, unknown>;
  const tx = db.transaction('widget-data', 'readwrite');
  for (const [key, value] of Object.entries(data)) {
    await tx.store.put(value, key);
  }
  await tx.done;
}
