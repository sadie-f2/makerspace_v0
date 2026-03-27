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
  /** URL to fetch the SVG from — use /api/admin/floorplans/[id]/svg for state-enriched SVG */
  svgUrl: string;
  onSpaceClick?: (space: ClickedSpace) => void;
  /** Remove the maxHeight scroll constraint — show the full floor plan */
  unconstrained?: boolean;
  /** Hide the shelf-level selector even if the SVG has shelf layers */
  hideShelves?: boolean;
}

const SHELF_LEVELS = [1, 2, 3];

// Colours that the server injects — kept here only for the legend.
const LEGEND = [
  { color: "#bbf7d0", label: "Vacant (available)" },
  { color: "#bfdbfe", label: "Rented" },
  { color: "#dbeafe", label: "Shop" },
  { color: "#fde8d8", label: "Storage (vacant)" },
  { color: "#e5e7eb", label: "Not synced" },
];

export default function FloorPlanViewer({ svgUrl, onSpaceClick, unconstrained, hideShelves }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgLoaded, setSvgLoaded] = useState(false);
  const [shelfLevel, setShelfLevel] = useState(1);
  const [hasShelves, setHasShelves] = useState(false);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    space: ClickedSpace;
  } | null>(null);

  // Inject SVG via ref so React never touches the container after initial load.
  useEffect(() => {
    if (!svgUrl) return;
    setSvgLoaded(false);
    setTooltip(null);
    fetch(svgUrl)
      .then(r => r.text())
      .then(html => {
        if (containerRef.current) {
          containerRef.current.innerHTML = html;
          setHasShelves(html.includes("shelf_l"));
          setSvgLoaded(true);
        }
      })
      .catch(() => {});
  }, [svgUrl]);

  const applyHandlers = useCallback(() => {
    const container = containerRef.current;
    if (!container || !svgLoaded) return;

    // Shelf visibility
    SHELF_LEVELS.forEach(level => {
      const g = container.querySelector(`#shelf_l${level}`) as HTMLElement | null;
      if (g) g.style.display = level === shelfLevel ? "" : "none";
    });

    // Attach event handlers — fills are already in the SVG via server-injected <style>
    container.querySelectorAll<SVGElement>("[data-space-id]").forEach(el => {
      const externalId = el.getAttribute("data-space-id")!;
      const type       = el.getAttribute("data-type") ?? "";
      const resourceId = el.getAttribute("data-resource-id") ?? null;
      const resourceName = el.getAttribute("data-resource-name") ?? null;
      const occupantName = el.getAttribute("data-occupant") ?? null;

      el.style.cursor = type === "common_area" ? "default" : "pointer";

      el.onmouseenter = (e) => {
        if (type === "common_area") return;
        // Highlight all units sharing the same resource (multi-unit studios)
        const peers = resourceId
          ? container.querySelectorAll<SVGElement>(`[data-resource-id="${resourceId}"]`)
          : [el];
        peers.forEach(p => p.classList.add("hovered"));
        const rect = (e.target as SVGElement).getBoundingClientRect();
        const cr = container.getBoundingClientRect();
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
        if (type === "common_area") return;
        onSpaceClick?.({ externalId, type, resourceId, resourceName, occupantName });
      };
    });
  }, [svgLoaded, shelfLevel, onSpaceClick]);

  useEffect(() => {
    applyHandlers();
  }, [applyHandlers]);

  return (
    <div className="relative">
      {hasShelves && !hideShelves && (
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
          <span>Shelf level:</span>
          {SHELF_LEVELS.map(l => (
            <button
              key={l}
              onClick={() => setShelfLevel(l)}
              className={`px-2 py-0.5 rounded border text-xs ${shelfLevel === l ? "bg-gray-800 text-white border-gray-800" : "border-gray-300 hover:border-gray-500"}`}
            >
              L{l}
            </button>
          ))}
        </div>
      )}

      {/* Plain div — innerHTML managed by useEffect only */}
      <div
        ref={containerRef}
        className={`border rounded bg-white ${unconstrained ? "" : "overflow-auto"}`}
        style={unconstrained ? undefined : { maxHeight: "70vh" }}
      />

      <div className="flex gap-4 mt-2 text-xs text-gray-500 flex-wrap">
        {LEGEND.map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm border border-gray-300" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>

      {tooltip && (
        <div
          className="absolute z-10 pointer-events-none bg-white border rounded shadow-md px-3 py-2 text-xs max-w-48"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          <p className="font-medium">{tooltip.space.resourceName ?? tooltip.space.externalId}</p>
          {tooltip.space.occupantName && (
            <p className="text-gray-500 mt-0.5">{tooltip.space.occupantName}</p>
          )}
          {!tooltip.space.resourceId && (
            <p className="text-amber-600 mt-0.5">Not linked to resource</p>
          )}
          <p className="text-gray-400 font-mono mt-0.5">{tooltip.space.externalId}</p>
        </div>
      )}
    </div>
  );
}
