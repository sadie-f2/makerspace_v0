"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface ClickedSpace {
  externalId: string;
  type: string;
  resourceId: string | null;
  resourceName: string | null;
  occupantName: string | null;
}

interface Props {
  svgUrl: string;
  onSpaceClick?: (space: ClickedSpace) => void;
  unconstrained?: boolean;
  hideShelves?: boolean;
  // Selection mode
  mode?: "view" | "select";
  selectedIds?: Set<string>;
  currentResourceId?: string;
  onSelectionChange?: (ids: Set<string>) => void;
}

const VIEW_LEGEND = [
  { color: "#bbf7d0", label: "Vacant" },
  { color: "#bfdbfe", label: "Rented" },
  { color: "#dbeafe", label: "Shop" },
  { color: "#fde8d8", label: "Storage" },
  { color: "#e5e7eb", label: "Not synced" },
];

const SELECT_LEGEND = [
  { color: "#f3f4f6", label: "Available" },
  { color: "#fef08a", label: "Selected" },
  { color: "#9ca3af", label: "Assigned elsewhere" },
];

const SELECT_STYLE = [
  `[data-type="studio_unit"] { fill: #f3f4f6 !important; }`,
  `.selected { fill: #fef08a !important; }`,
  `.locked   { fill: #9ca3af !important; cursor: not-allowed; }`,
  `.hovered:not(.locked) { fill: #fef9c3 !important; }`,
].join("\n");

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 12;
const DRAG_THRESHOLD = 4; // px — below this, treat as a click not a drag

export default function FloorPlanViewer({
  svgUrl,
  onSpaceClick,
  unconstrained,
  hideShelves,
  mode = "view",
  selectedIds,
  currentResourceId,
  onSelectionChange,
}: Props) {
  const outerRef    = useRef<HTMLDivElement>(null);   // pan/zoom event target
  const containerRef = useRef<HTMLDivElement>(null);  // SVG injection target, receives CSS transform

  const [svgLoaded, setSvgLoaded] = useState(false);
  const [shelfLevels, setShelfLevels] = useState<number[]>([]);
  const [shelfLevel, setShelfLevel] = useState(1);
  const [hasShelves, setHasShelves] = useState(false);
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; space: ClickedSpace;
  } | null>(null);

  // Pan/zoom state
  const [zoom, setZoom]             = useState(1);
  const [pan, setPan]               = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  // Multi-pointer tracking (handles both mouse drag and touch pinch)
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDist  = useRef<number | null>(null);
  const lastPinchMid   = useRef<{ x: number; y: number } | null>(null);
  const dragMoved      = useRef(false);

  // Load SVG
  useEffect(() => {
    if (!svgUrl) return;
    setSvgLoaded(false);
    setTooltip(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    const controller = new AbortController();
    fetch(svgUrl, { signal: controller.signal })
      .then(r => r.text())
      .then(html => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = html;

        // Detect shelf levels dynamically from SVG groups
        const matches = [...html.matchAll(/data-shelf-layer="shelf_l(\d+)"/g)];
        const levels = [...new Set(matches.map(m => parseInt(m[1])))].sort((a, b) => a - b);
        setShelfLevels(levels);
        setHasShelves(levels.length > 0);

        if (mode === "select") {
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            const style = document.createElement("style");
            style.textContent = SELECT_STYLE;
            svgEl.appendChild(style);
          }
        }
        setSvgLoaded(true);
      })
      .catch(err => { if (err.name !== "AbortError") console.error("SVG load failed:", err); });
    return () => controller.abort();
  }, [svgUrl, mode]);

  // ── Pan/zoom handlers ──────────────────────────────────────────────────────

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const rect = outer.getBoundingClientRect();
      // cursor position relative to the outer container
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setZoom(z => {
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
        // zoom toward cursor: keep the point under the cursor fixed
        setPan(p => ({
          x: mx - (mx - p.x) * (newZoom / z),
          y: my - (my - p.y) * (newZoom / z),
        }));
        return newZoom;
      });
    };

    // passive: false required to call preventDefault
    outer.addEventListener("wheel", onWheel, { passive: false });
    return () => outer.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Accept primary button mouse clicks and all touch/pen contacts
    if (e.pointerType === "mouse" && e.button !== 0) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.current.size === 1) {
      dragMoved.current = false;
    }
    setIsDragging(true);
    setTooltip(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const ptrs = activePointers.current;
    if (!ptrs.has(e.pointerId)) return;

    const prev = ptrs.get(e.pointerId)!;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const outer = outerRef.current;
    if (!outer) return;
    const outerRect = outer.getBoundingClientRect();

    if (ptrs.size === 1) {
      // Single pointer — pan
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (!dragMoved.current && Math.hypot(dx, dy) > DRAG_THRESHOLD) dragMoved.current = true;
      if (dragMoved.current) setPan(p => ({ x: p.x + dx, y: p.y + dy }));

    } else if (ptrs.size === 2) {
      // Two pointers — pinch zoom + pan from midpoint
      const [p1, p2] = [...ptrs.values()];
      const newDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const newMid  = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      // midpoint relative to outer container
      const mx = newMid.x - outerRect.left;
      const my = newMid.y - outerRect.top;

      if (lastPinchDist.current !== null && lastPinchMid.current !== null) {
        const factor = newDist / lastPinchDist.current;
        const dmx = mx - (lastPinchMid.current.x - outerRect.left);
        const dmy = my - (lastPinchMid.current.y - outerRect.top);
        setZoom(z => {
          const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
          setPan(p => ({
            x: mx - (mx - p.x) * (newZoom / z) + dmx,
            y: my - (my - p.y) * (newZoom / z) + dmy,
          }));
          return newZoom;
        });
        dragMoved.current = true;
      }
      lastPinchDist.current = newDist;
      lastPinchMid.current  = newMid;
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) {
      lastPinchDist.current = null;
      lastPinchMid.current  = null;
    }
    if (activePointers.current.size === 0) setIsDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    activePointers.current.clear();
    lastPinchDist.current = null;
    lastPinchMid.current  = null;
  };;

  // ── Space event handlers ───────────────────────────────────────────────────

  const applyHandlers = useCallback(() => {
    const container = containerRef.current;
    if (!container || !svgLoaded) return;

    // Show/hide shelf level groups
    shelfLevels.forEach(level => {
      const g = container.querySelector(`[data-shelf-layer="shelf_l${level}"]`) as HTMLElement | null;
      if (g) g.style.display = level === shelfLevel ? "" : "none";
    });

    container.querySelectorAll<SVGElement>("[data-space-id]").forEach(el => {
      const externalId   = el.getAttribute("data-space-id")!;
      const type         = el.getAttribute("data-type") ?? "";
      const resourceId   = el.getAttribute("data-resource-id") ?? null;
      const resourceName = el.getAttribute("data-resource-name") ?? null;
      const occupantName = el.getAttribute("data-occupant") ?? null;

      if (mode === "select") {
        if (type !== "studio_unit") { el.style.cursor = "default"; return; }
        const isLocked = !!resourceId && resourceId !== currentResourceId;
        el.style.cursor = isLocked ? "not-allowed" : "pointer";

        el.onmouseenter = (e) => {
          if (isLocked || dragMoved.current) return;
          el.classList.add("hovered");
          const rect = (e.target as SVGElement).getBoundingClientRect();
          const cr = outerRef.current!.getBoundingClientRect();
          setTooltip({
            x: rect.left - cr.left + rect.width / 2,
            y: rect.top - cr.top - 8,
            space: { externalId, type, resourceId, resourceName, occupantName },
          });
        };
        el.onmouseleave = () => {
          el.classList.remove("hovered");
          setTooltip(null);
        };
        el.onclick = () => {
          if (isLocked || !onSelectionChange || dragMoved.current) return;
          const next = new Set(selectedIds ?? []);
          if (next.has(externalId)) next.delete(externalId);
          else next.add(externalId);
          onSelectionChange(next);
        };
      } else {
        el.style.cursor = type === "common_area" ? "default" : "pointer";
        el.onmouseenter = (e) => {
          if (type === "common_area" || dragMoved.current) return;
          const peers = resourceId
            ? container.querySelectorAll<SVGElement>(`[data-resource-id="${resourceId}"]`)
            : [el];
          peers.forEach(p => p.classList.add("hovered"));
          const rect = (e.target as SVGElement).getBoundingClientRect();
          const cr = outerRef.current!.getBoundingClientRect();
          setTooltip({
            x: rect.left - cr.left + rect.width / 2,
            y: rect.top - cr.top - 8,
            space: { externalId, type, resourceId, resourceName, occupantName },
          });
        };
        el.onmouseleave = () => {
          const peers = resourceId
            ? container.querySelectorAll<SVGElement>(`[data-resource-id="${resourceId}"]`)
            : [el];
          peers.forEach(p => p.classList.remove("hovered"));
          setTooltip(null);
        };
        el.onclick = () => {
          if (type === "common_area" || dragMoved.current) return;
          onSpaceClick?.({ externalId, type, resourceId, resourceName, occupantName });
        };
      }
    });
  }, [svgLoaded, shelfLevel, shelfLevels, mode, onSpaceClick, onSelectionChange, currentResourceId, selectedIds]);

  useEffect(() => { applyHandlers(); }, [applyHandlers]);

  // Sync .selected / .locked classes in select mode
  useEffect(() => {
    if (!svgLoaded || mode !== "select") return;
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll<SVGElement>("[data-space-id]").forEach(el => {
      const externalId = el.getAttribute("data-space-id")!;
      const resourceId = el.getAttribute("data-resource-id") ?? null;
      const isLocked   = !!resourceId && resourceId !== currentResourceId;
      el.classList.toggle("selected", !isLocked && (selectedIds?.has(externalId) ?? false));
      el.classList.toggle("locked", isLocked);
    });
  }, [svgLoaded, mode, selectedIds, currentResourceId]);

  const legend = mode === "select" ? SELECT_LEGEND : VIEW_LEGEND;
  const cursorStyle = isDragging ? "grabbing" : "grab";

  return (
    <div className="relative">
      {hasShelves && !hideShelves && mode === "view" && (
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
          <span>Shelf level:</span>
          {shelfLevels.map(l => (
            <button
              key={l}
              onClick={() => setShelfLevel(l)}
              aria-pressed={shelfLevel === l}
              aria-label={`Shelf level ${l}`}
              className={`px-2 py-0.5 rounded border text-xs ${shelfLevel === l ? "bg-gray-800 text-white border-gray-800" : "border-gray-300 hover:border-gray-500"}`}
            >
              L{l}
            </button>
          ))}
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <button
          onClick={() => setZoom(z => Math.min(MAX_ZOOM, z * 1.25))}
          className="w-7 h-7 bg-white border rounded shadow text-sm font-bold hover:bg-gray-50 flex items-center justify-center"
          aria-label="Zoom in"
        ><span aria-hidden="true">+</span></button>
        <button
          onClick={() => setZoom(z => Math.max(MIN_ZOOM, z / 1.25))}
          className="w-7 h-7 bg-white border rounded shadow text-sm font-bold hover:bg-gray-50 flex items-center justify-center"
          aria-label="Zoom out"
        ><span aria-hidden="true">−</span></button>
        <button
          onClick={resetView}
          className="w-7 h-7 bg-white border rounded shadow text-xs hover:bg-gray-50 flex items-center justify-center"
          aria-label="Reset view"
        ><span aria-hidden="true">⊡</span></button>
      </div>

      {/* Outer container: clips, receives wheel/drag */}
      <div
        ref={outerRef}
        className="border rounded bg-white select-none overflow-hidden"
        style={{
          ...(unconstrained ? undefined : { maxHeight: "70vh" }),
          cursor: cursorStyle,
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Inner container: receives SVG, gets CSS transform */}
        <div
          ref={containerRef}
          style={{
            transformOrigin: "0 0",
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            willChange: "transform",
          }}
        />
      </div>

      <div className="flex gap-4 mt-2 text-xs text-gray-500 flex-wrap">
        {legend.map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm border border-gray-300" style={{ background: color }} />
            {label}
          </span>
        ))}
        <span className="ml-auto text-gray-400">{Math.round(zoom * 100)}%</span>
      </div>

      {tooltip && (
        <div
          className="absolute z-10 pointer-events-none bg-white border rounded shadow-md px-3 py-2 text-xs max-w-48"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          <p className="font-medium">{tooltip.space.resourceName ?? tooltip.space.externalId}</p>
          {tooltip.space.occupantName && <p className="text-gray-500 mt-0.5">{tooltip.space.occupantName}</p>}
          {mode === "view" && !tooltip.space.resourceId && (
            <p className="text-amber-600 mt-0.5">Not linked to resource</p>
          )}
          <p className="text-gray-400 font-mono mt-0.5">{tooltip.space.externalId}</p>
        </div>
      )}
    </div>
  );
}
