"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FloorPlanViewer from "@/components/FloorPlanViewer";
import { normalizeArea, buildStudioName, buildAreaMap, nextStudioN, parseStudioName } from "@/lib/studioNaming";

interface Props {
  studio: {
    id: string;
    name: string;
    currentUnitIds: string[];
  };
  floorPlanId: string;
  allowedCounts: number[];
  existingNames: string[];  // other studios' names — for area suggestions + uniqueness check
}

export default function StudioEditForm({ studio, floorPlanId, allowedCounts, existingNames }: Props) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(studio.currentUnitIds));
  const [areaInput, setAreaInput]     = useState(() => parseStudioName(studio.name)?.area ?? "");
  const [submitting, setSubmitting]   = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [error, setError]             = useState("");

  // ── Naming ────────────────────────────────────────────────────────────────
  const currentParsed   = parseStudioName(studio.name);
  const isLegacyName    = currentParsed === null;
  const areaMap         = buildAreaMap(existingNames);
  const existingAreas   = Array.from(areaMap.keys()).sort();
  const normalizedArea  = normalizeArea(areaInput);
  // When renaming within same area, preserve old N so the slot isn't "wasted"
  const sameArea        = currentParsed && normalizedArea === currentParsed.area;
  const suggestedN      = sameArea ? currentParsed!.n : nextStudioN(normalizedArea, existingNames);
  const suggestedName   = areaInput.trim() ? buildStudioName(normalizedArea, suggestedN) : "";
  const isNewArea       = areaInput.trim() !== "" && !areaMap.has(normalizedArea) && !sameArea;
  const nameChanged     = suggestedName !== "" && suggestedName !== studio.name;
  const nameToSubmit    = nameChanged ? suggestedName : undefined;

  // ── Units ─────────────────────────────────────────────────────────────────
  const count        = selectedIds.size;
  const isValidCount = allowedCounts.includes(count);
  const unitsChanged = (() => {
    const prev = new Set(studio.currentUnitIds);
    if (prev.size !== selectedIds.size) return true;
    for (const id of selectedIds) if (!prev.has(id)) return true;
    return false;
  })();

  const canSave = isValidCount && (unitsChanged || nameChanged) && !submitting;
  const svgUrl  = `/api/admin/floorplans/${floorPlanId}/svg`;

  async function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/studios/${studio.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitIds: Array.from(selectedIds), name: nameToSubmit }),
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

  async function handleDelete() {
    if (!confirm(`Delete studio "${studio.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/studios/${studio.id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Delete failed"); return; }
      router.push("/admin/studios");
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <a href="/admin/studios" className="text-sm text-gray-500 hover:underline">← Studios</a>
        <span className="text-gray-300">/</span>
        <h2 className="text-sm font-semibold font-mono">{studio.name}</h2>
      </div>

      {/* Rename section */}
      <div className="border rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-600">Name</p>
          {isLegacyName && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
              Legacy name — does not match convention
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 max-w-xs">
          <span className="text-sm text-gray-400 font-mono">s</span>
          <Input
            list="area-tokens-edit"
            value={areaInput}
            onChange={e => setAreaInput(e.target.value)}
            placeholder={isLegacyName ? "Enter area to rename…" : currentParsed!.area}
            className="h-8 text-sm font-mono"
          />
          <datalist id="area-tokens-edit">
            {existingAreas.map(a => <option key={a} value={a} />)}
          </datalist>
        </div>
        {suggestedName && (
          <div className="flex items-center gap-2 text-xs">
            {nameChanged ? (
              <>
                <span className="text-gray-400 line-through font-mono">{studio.name}</span>
                <span className="text-gray-400">→</span>
                <span className="font-mono font-medium">{suggestedName}</span>
                {isNewArea && <span className="text-amber-600">(new area)</span>}
              </>
            ) : (
              <span className="text-gray-400 font-mono">{suggestedName} (unchanged)</span>
            )}
          </div>
        )}
      </div>

      {/* Floor plan unit picker */}
      <div>
        <p className="text-xs text-gray-500 mb-2">Click to add or remove units. Current units are pre-selected.</p>
        <FloorPlanViewer
          svgUrl={svgUrl}
          mode="select"
          selectedIds={selectedIds}
          currentResourceId={studio.id}
          onSelectionChange={setSelectedIds}
          unconstrained
          hideShelves
        />
      </div>

      {count > 0 && (
        <p className={`text-xs ${isValidCount ? "text-green-700" : "text-red-600"}`}>
          {count} unit{count !== 1 ? "s" : ""} selected
          {isValidCount
            ? ` — ${count * 50} sf`
            : ` — not an allowed size (${allowedCounts.sort((a, b) => a - b).join(", ")} unit${allowedCounts.length !== 1 ? "s" : ""})`
          }
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={!canSave} size="sm">
          {submitting ? "Saving…" : "Save changes"}
        </Button>
        <a href="/admin/studios" className="text-xs text-gray-400 hover:underline">Cancel</a>
        <div className="flex-1" />
        <Button onClick={handleDelete} disabled={deleting} variant="destructive" size="sm">
          {deleting ? "Deleting…" : "Delete studio"}
        </Button>
      </div>
    </div>
  );
}
