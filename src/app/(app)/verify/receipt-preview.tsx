"use client";

import { useCallback, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, Move } from "lucide-react";

type ReceiptPreviewProps = {
  src: string;
  alt: string;
  referenceNumber: string;
  /** OCR-extracted ref for match badge (omit when unavailable). */
  aiExtractedRefNo?: string | null;
};

export function ReceiptPreview({
  src,
  alt,
  referenceNumber,
  aiExtractedRefNo = null,
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
            className="ui-icon-btn !h-9 !w-9 !min-h-9 !min-w-9"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-[3rem] text-center type-caption tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            className="ui-icon-btn !h-9 !w-9 !min-h-9 !min-w-9"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="ui-icon-btn !h-9 !w-9 !min-h-9 !min-w-9"
            aria-label="Reset view"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        className="relative min-h-0 flex-1 cursor-grab overflow-hidden bg-[var(--app-chrome)] active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-[var(--radius)] bg-black/55 px-2 py-1 type-caption text-white">
          <Move className="h-3.5 w-3.5" />
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

      <div className="border-t border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3">
        <label className="ui-field-label">Reference number check</label>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex h-11 flex-1 items-center rounded-[var(--radius)] bg-[var(--surface)] px-3 font-mono type-body-sm text-[var(--ink)] ring-1 ring-[var(--border)]">
            {referenceNumber}
          </code>
          {aiExtractedRefNo ? (
            <span
              className={
                aiExtractedRefNo.trim().toUpperCase() ===
                referenceNumber.trim().toUpperCase()
                  ? "rounded-[var(--radius)] bg-[var(--success-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--success)]"
                  : "rounded-[var(--radius)] bg-[var(--warning-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--warning)]"
              }
            >
              {aiExtractedRefNo.trim().toUpperCase() ===
              referenceNumber.trim().toUpperCase()
                ? "OCR match"
                : "OCR differs"}
            </span>
          ) : (
            <span className="type-caption shrink-0">No OCR ref</span>
          )}
        </div>
      </div>
    </div>
  );
}
