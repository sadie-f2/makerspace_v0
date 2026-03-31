"use client";

import { useState } from "react";
import FloorPlanViewer, { type ClickedSpace } from "@/components/FloorPlanViewer";

interface FloorPlanMeta {
  id: string;
  building: string;
  floor: number;
}

interface Props {
  floorPlans: FloorPlanMeta[];
}

function highlightRow(resourceId: string) {
  const row = document.getElementById(`resource-${resourceId}`);
  if (!row) return;
  row.scrollIntoView({ behavior: "smooth", block: "nearest" });
  row.style.transition = "background-color 0.2s";
  row.style.backgroundColor = "#fef9c3";
  setTimeout(() => { row.style.backgroundColor = ""; }, 1500);
}

export default function StorageFloorPlan({ floorPlans }: Props) {
  const [open, setOpen]     = useState(false);
  const [activeId, setActiveId] = useState<string>(floorPlans[0]?.id ?? "");

  if (floorPlans.length === 0) return null;

  return (
    <div className="mb-6 border rounded-md overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="storage-floorplan-panel"
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-left"
      >
        <span>Floor plan</span>
        <span aria-hidden="true" className="text-gray-400 text-xs">{open ? "▲ hide" : "▼ show"}</span>
      </button>

      {open && (
        <div id="storage-floorplan-panel" className="p-3">
          {floorPlans.length > 1 && (
            <div role="tablist" aria-label="Floor plan" className="flex gap-1 mb-2">
              {floorPlans.map(fp => (
                <button
                  key={fp.id}
                  role="tab"
                  aria-selected={activeId === fp.id}
                  onClick={() => setActiveId(fp.id)}
                  className={`px-2 py-0.5 text-xs rounded border ${activeId === fp.id ? "bg-gray-800 text-white border-gray-800" : "border-gray-300 hover:border-gray-500"}`}
                >
                  Bldg {fp.building} · F{fp.floor}
                </button>
              ))}
            </div>
          )}
          {activeId && (
            <FloorPlanViewer
              svgUrl={`/api/admin/floorplans/${activeId}/svg`}
              unconstrained
              onSpaceClick={(space: ClickedSpace) => {
                if (space.resourceId) highlightRow(space.resourceId);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
