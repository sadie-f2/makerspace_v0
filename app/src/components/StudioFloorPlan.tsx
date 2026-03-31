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

export default function StudioFloorPlan({ floorPlans }: Props) {
  const [activeId, setActiveId] = useState<string>(floorPlans[0]?.id ?? "");

  if (floorPlans.length === 0) return null;

  return (
    <div className="mb-8">
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
          hideShelves
          onSpaceClick={(space: ClickedSpace) => {
            if (space.resourceId) highlightRow(space.resourceId);
          }}
        />
      )}
    </div>
  );
}
