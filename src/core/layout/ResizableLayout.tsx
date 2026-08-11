import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';

interface PanelState {
  leftWidth: number;
  rightWidth: number;
}

const STORAGE_KEY = 'entrance-panel-sizes';
const MIN_WIDTH = 200;
const MAX_LEFT = 500;
const MAX_RIGHT = 500;
const DEFAULT_LEFT = 320;
const DEFAULT_RIGHT = 320;

function loadSizes(): PanelState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        leftWidth: Math.max(MIN_WIDTH, Math.min(MAX_LEFT, parsed.leftWidth || DEFAULT_LEFT)),
        rightWidth: Math.max(MIN_WIDTH, Math.min(MAX_RIGHT, parsed.rightWidth || DEFAULT_RIGHT)),
      };
    }
  } catch {}
  return { leftWidth: DEFAULT_LEFT, rightWidth: DEFAULT_RIGHT };
}

function saveSizes(sizes: PanelState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes)); } catch {}
}

interface ResizableLayoutProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  rightVisible: boolean;
}

export function ResizableLayout({ left, center, right, rightVisible }: ResizableLayoutProps) {
  const [sizes, setSizes] = useState<PanelState>(loadSizes);
  const [dragging, setDragging] = useState<'left' | 'right' | null>(null);
  const startRef = useRef({ x: 0, width: 0 });

  const onMouseDown = useCallback((handle: 'left' | 'right', e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(handle);
    startRef.current = {
      x: e.clientX,
      width: handle === 'left' ? sizes.leftWidth : sizes.rightWidth,
    };
  }, [sizes]);

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startRef.current.x;
      setSizes((prev) => {
        let next: PanelState;
        if (dragging === 'left') {
          const w = Math.max(MIN_WIDTH, Math.min(MAX_LEFT, startRef.current.width + delta));
          next = { ...prev, leftWidth: w };
        } else {
          // Right divider: dragging to the LEFT increases right panel width
          const w = Math.max(MIN_WIDTH, Math.min(MAX_RIGHT, startRef.current.width - delta));
          next = { ...prev, rightWidth: w };
        }
        return next;
      });
    };

    const onMouseUp = () => {
      setDragging((prev) => {
        if (prev) {
          // Save on next tick so state has the final value
          setTimeout(() => {
            setSizes((current) => {
              saveSizes(current);
              return current;
            });
          }, 0);
        }
        return null;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging]);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left panel */}
      <div
        className="shrink-0 border-r border-black/[0.04] dark:border-white/[0.04] bg-surface-50 dark:bg-[#0f0f14] overflow-hidden"
        style={{ width: sizes.leftWidth }}
      >
        {left}
      </div>

      {/* Left divider */}
      <Divider
        onMouseDown={(e) => onMouseDown('left', e)}
        active={dragging === 'left'}
      />

      {/* Center (flexible) */}
      <div className="flex-1 overflow-auto min-w-[200px]">
        {center}
      </div>

      {/* Right divider + panel */}
      {rightVisible && (
        <>
          <Divider
            onMouseDown={(e) => onMouseDown('right', e)}
            active={dragging === 'right'}
          />
          <div
            className="shrink-0 border-l border-black/[0.04] dark:border-white/[0.04] bg-surface-50 dark:bg-[#0f0f14] overflow-hidden"
            style={{ width: sizes.rightWidth }}
          >
            {right}
          </div>
        </>
      )}
    </div>
  );
}

function Divider({
  onMouseDown,
  active,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  active: boolean;
}) {
  return (
    <div
      className={`relative w-1.5 shrink-0 cursor-col-resize group -mx-0.5 z-10 ${
        active ? 'bg-primary-500/20' : 'hover:bg-primary-500/10'
      } transition-colors`}
      onMouseDown={onMouseDown}
    >
      {/* Invisible wider hit area */}
      <div className="absolute inset-y-0 -left-1 -right-1" />
      {/* Visible grip line */}
      <div className={`absolute inset-y-4 left-1/2 -translate-x-1/2 w-0.5 rounded-full transition-all ${
        active ? 'bg-primary-500 scale-y-110' : 'bg-transparent group-hover:bg-primary-400/40'
      }`} />
    </div>
  );
}
