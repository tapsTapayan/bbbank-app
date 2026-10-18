"use client";

import { useCallback, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, Move } from "lucide-react";

type ReceiptPreviewProps = {
  src: string;
  alt: string;
  referenceNumber: string;
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

  const zoomIn = () =>
    setScale((s) => Math.min(3, Number((s + 0.25).toFixed(2))));
  const zoomOut = () =>
    setScale((s) => Math.max(0.5, Number((s - 0.25).toFixed(2))));
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

  const ocrMatch =
    aiExtractedRefNo &&
    aiExtractedRefNo.trim().toUpperCase() ===
      referenceNumber.trim().toUpperCase();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="rl-ops-toolbar">
        <div className="min-w-0">
          <p className="type-label">Receipt Evidence</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            className="rl-icon-btn rl-icon-btn-sm"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-[3.25rem] text-center font-mono text-xs font-semibold tabular-nums text-[var(--ink-secondary)]">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            className="rl-icon-btn rl-icon-btn-sm"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rl-icon-btn rl-icon-btn-sm"
            aria-label="Reset zoom"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        className="relative min-h-[260px] flex-1 cursor-grab overflow-hidden bg-[#071526] active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-xs">
          <Move className="h-3 w-3" />
          Drag to pan
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute left-1/2 top-1/2 max-h-[92%] max-w-[92%] select-none object-contain shadow-2xl"
          style={{
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
            transformOrigin: "center center",
          }}
        />
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="type-label">Declared Reference</span>
          {aiExtractedRefNo ? (
            <span
              className={
                ocrMatch
                  ? "rl-pill rl-pill-verified"
                  : "rl-pill rl-pill-pending"
              }
            >
              {ocrMatch ? "OCR Match" : "OCR Differs"}
            </span>
          ) : (
            <span className="type-caption">Manual Ref</span>
          )}
        </div>
        <code className="mt-1.5 flex h-10 w-full items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 font-mono text-sm font-bold text-[var(--ink)]">
          {referenceNumber || "—"}
        </code>
      </div>
    </div>
  );
}
