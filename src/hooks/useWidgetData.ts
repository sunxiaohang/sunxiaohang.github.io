import { useState, useEffect, useCallback, useRef } from 'react';
import { readWidgetData, writeWidgetData, deleteWidgetData } from '@/lib/db';

export function useWidgetData<T>(
  instanceId: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const latestData = useRef<T>(defaultValue);

  // Load from IndexedDB on mount. No initialized guard - let StrictMode
  // double-fire; each run properly cancels its predecessor.
  useEffect(() => {
    let cancelled = false;

    readWidgetData<T>(instanceId)
      .then((stored) => {
        if (cancelled) return;
        const value = stored !== undefined ? stored : defaultValue;
        latestData.current = value;
        setData(value);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData(defaultValue);
        latestData.current = defaultValue;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Only re-run if instanceId changes
  }, [instanceId]);

  // Persist with debounce
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();

  const persistData = useCallback(
    (newData: T) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        writeWidgetData(instanceId, newData);
      }, 300);
    },
    [instanceId]
  );

  const setAndPersist = useCallback(
    (value: T | ((prev: T) => T)) => {
      setData((prev) => {
        const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
        persistData(next);
        return next;
      });
    },
    [persistData]
  );

  // Attach cleanup for external callers
  const remove = useCallback(() => {
    deleteWidgetData(instanceId);
    setData(defaultValue);
  }, [instanceId, defaultValue]);

  (setAndPersist as unknown as { remove: typeof remove }).remove = remove;

  return [data, setAndPersist, loading];
}
