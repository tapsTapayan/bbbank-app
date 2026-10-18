"use client";

import { useCallback, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, Move } from "lucide-react";

type ReceiptPreviewProps = {
  src: string;
  alt: string;
  referenceNumber: string;
};

export function ReceiptPreview({
  src,
  alt,
  referenceNumber,
}: ReceiptPreviewProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });

  const zoomIn = () => setScale((s) => Math.min(3, Number((s + 0.25).toFixed(2))));
  const zoomOut = () => setScale((s) => Math.max(0.5, Number((s - 0.25).toFixed(2))));
  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    lastPoint.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPoint.current.x;
    const dy = e.clientY - lastPoint.current.y;
    lastPoint.current = { x: e.clientX, y: e.clientY };
    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">
            Receipt preview
          </p>
          <p className="truncate font-mono text-sm font-semibold text-[var(--ink)]">
            Ref: {referenceNumber}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            className="rounded-md p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-[3rem] text-center text-xs tabular-nums text-[var(--ink-muted)]">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            className="rounded-md p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded-md p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
            aria-label="Reset view"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        className="relative min-h-0 flex-1 cursor-grab overflow-hidden bg-[var(--console-bg)] active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-[10px] font-medium text-white">
          <Move className="h-3 w-3" />
          Drag to pan
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- mock data URLs; next/image not suitable */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute left-1/2 top-1/2 max-h-[90%] max-w-[90%] select-none object-contain shadow-lg"
          style={{
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
            transformOrigin: "center center",
          }}
        />
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-2.5">
        <label className="block text-xs font-medium text-[var(--ink-muted)]">
          Reference number check
        </label>
        <div className="mt-1 flex items-center gap-2">
          <code className="flex-1 rounded-md bg-[var(--surface)] px-3 py-1.5 font-mono text-sm text-[var(--ink)] ring-1 ring-[var(--border)]">
            {referenceNumber}
          </code>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            Match field
          </span>
        </div>
      </div>
    </div>
  );
}
