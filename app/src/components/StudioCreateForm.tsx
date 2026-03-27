"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FloorPlanViewer from "@/components/FloorPlanViewer";
import { normalizeArea, buildStudioName, buildAreaMap, nextStudioN } from "@/lib/studioNaming";

interface FloorPlanMeta {
  id: string;
  building: string;
  floor: number;
}

interface Props {
  floorPlans: FloorPlanMeta[];
  existingNames: string[];
  allowedCounts: number[];
}

export default function StudioCreateForm({ floorPlans, existingNames, allowedCounts }: Props) {
  const router = useRouter();
  const [fpId, setFpId]           = useState(floorPlans[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [areaInput, setAreaInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState("");

  const areaMap      = buildAreaMap(existingNames);
  const existingAreas = Array.from(areaMap.keys()).sort();
  const normalizedArea = normalizeArea(areaInput);
  const n            = nextStudioN(normalizedArea, existingNames);
  const suggestedName = areaInput.trim() ? buildStudioName(normalizedArea, n) : "";
  const isNewArea    = areaInput.trim() !== "" && !areaMap.has(normalizedArea);
  const count        = selectedIds.size;
  const isValidCount = allowedCounts.includes(count);
  const canSubmit    = suggestedName !== "" && count > 0 && isValidCount && !submitting;

  const svgUrl = fpId ? `/api/admin/floorplans/${fpId}/svg` : "";

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/studios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: suggestedName, unitIds: Array.from(selectedIds) }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Unknown error"); return; }
      router.push("/admin/studios");
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <a href="/admin/studios" className="text-sm text-gray-500 hover:underline">← Studios</a>
        <span className="text-gray-300">/</span>
        <h2 className="text-sm font-semibold">New studio</h2>
      </div>

      {/* Floor plan selector */}
      {floorPlans.length > 1 && (
        <div className="space-y-1">
          <Label className="text-xs">Floor plan</Label>
          <select
            value={fpId}
            onChange={e => { setFpId(e.target.value); setSelectedIds(new Set()); }}
            className="block border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            {floorPlans.map(fp => (
              <option key={fp.id} value={fp.id}>Building {fp.building} — Floor {fp.floor}</option>
            ))}
          </select>
        </div>
      )}

      {/* Floor plan map in select mode */}
      {fpId ? (
        <div>
          <p className="text-xs text-gray-500 mb-2">Click units to select — only unassigned studio units are selectable.</p>
          <FloorPlanViewer
            svgUrl={svgUrl}
            mode="select"
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            unconstrained
            hideShelves
          />
        </div>
      ) : (
        <p className="text-sm text-gray-400">No floor plans with studio units found.</p>
      )}

      {/* Unit count feedback */}
      {count > 0 && (
        <p className={`text-xs ${isValidCount ? "text-green-700" : "text-red-600"}`}>
          {count} unit{count !== 1 ? "s" : ""} selected
          {isValidCount
            ? ` — ${count * 50} sf`
            : ` — not an allowed size (${allowedCounts.sort((a,b)=>a-b).join(", ")} unit${allowedCounts.length !== 1 ? "s" : ""})`
          }
        </p>
      )}

      {/* Area input + name preview */}
      <div className="space-y-2 max-w-xs">
        <Label className="text-xs">Area</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400 font-mono">s</span>
          <Input
            list="area-tokens"
            value={areaInput}
            onChange={e => setAreaInput(e.target.value)}
            placeholder="10, FIBER, NE…"
            className="h-8 text-sm font-mono"
          />
          <datalist id="area-tokens">
            {existingAreas.map(a => <option key={a} value={a} />)}
          </datalist>
        </div>
        {suggestedName && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">Name:</span>
            <span className="font-mono font-medium">{suggestedName}</span>
            {isNewArea && <span className="text-amber-600">(new area)</span>}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button onClick={handleSubmit} disabled={!canSubmit} size="sm">
          {submitting ? "Creating…" : "Create studio"}
        </Button>
        <a href="/admin/studios" className="text-xs text-gray-400 hover:underline self-center">Cancel</a>
      </div>
    </div>
  );
}
