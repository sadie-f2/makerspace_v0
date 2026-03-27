"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PreviewDiff } from "@/app/api/admin/floorplans/upload/preview/route";

interface FloorPlanMeta {
  id:       string;
  building: string;
  floor:    number;
}

interface Props {
  existingFloorPlans:  FloorPlanMeta[];
  bypassMarkerForId?:  string;  // pre-selects this FP and skips marker check
}

interface PreviewData {
  previewToken: string;
  intent:       "new" | "revision";
  building:     string;
  floor:        number;
  svgContent:   string;
  diff:         PreviewDiff;
  blocked:      boolean;
}

interface CommitResult {
  floorPlanId: string;
  revisionId:  string;
  svgPath:     string;
  marker:      string;
}

type Step = "form" | "previewing" | "preview" | "committing" | "done" | "error";

export default function FloorPlanUpload({ existingFloorPlans, bypassMarkerForId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [intent,      setIntent]      = useState<"new" | "revision">(bypassMarkerForId ? "revision" : "new");
  const [floorPlanId, setFloorPlanId] = useState(bypassMarkerForId ?? existingFloorPlans[0]?.id ?? "");
  const [step,        setStep]        = useState<Step>("form");
  const [errorMsg,    setErrorMsg]    = useState("");
  const [preview,     setPreview]     = useState<PreviewData | null>(null);
  const [committed,   setCommitted]   = useState<CommitResult | null>(null);

  async function handlePreview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStep("previewing");
    setErrorMsg("");

    const form = e.currentTarget;
    const data = new FormData();
    data.set("intent", intent);
    if (intent === "revision") {
      data.set("floorPlanId", floorPlanId);
      if (bypassMarkerForId && bypassMarkerForId === floorPlanId) {
        data.set("skipMarkerCheck", "true");
      }
    } else {
      data.set("building", (form.elements.namedItem("building") as HTMLInputElement).value);
      data.set("floor",    (form.elements.namedItem("floor")    as HTMLInputElement).value);
    }
    const fileInput = fileRef.current;
    if (!fileInput?.files?.[0]) { setStep("form"); return; }
    data.set("dxf", fileInput.files[0]);

    try {
      const res = await fetch("/api/admin/floorplans/upload/preview", { method: "POST", body: data });
      const json = await res.json();
      if (!res.ok) { setStep("error"); setErrorMsg(json.error); return; }
      setPreview(json as PreviewData);
      setStep("preview");
    } catch (err) {
      setStep("error");
      setErrorMsg(String(err));
    }
  }

  async function handleCommit() {
    if (!preview) return;
    setStep("committing");
    try {
      const res = await fetch("/api/admin/floorplans/upload/commit", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ previewToken: preview.previewToken }),
      });
      const json = await res.json();
      if (!res.ok) { setStep("error"); setErrorMsg(json.error); return; }
      setCommitted(json as CommitResult);
      setStep("done");
    } catch (err) {
      setStep("error");
      setErrorMsg(String(err));
    }
  }

  function reset() {
    setStep("form");
    setPreview(null);
    setCommitted(null);
    setErrorMsg("");
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── Step: form ─────────────────────────────────────────────────────────────
  if (step === "form" || step === "previewing") {
    return (
      <div className="border rounded-md p-4">
        <h3 className="text-sm font-medium mb-4">Upload DXF floor plan</h3>
        {bypassMarkerForId && (
          <div className="mb-4 px-3 py-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <strong>Marker check bypassed (bootstrap mode).</strong> This floor plan has no provenance marker yet.
            The revision will be committed and marked accordingly in the audit log.
            After this upload, all future revisions must use the downloaded labeled DXF.
          </div>
        )}

        <form onSubmit={handlePreview} className="space-y-4">

          {/* Intent selector */}
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio" name="intent" value="new"
                checked={intent === "new"}
                onChange={() => setIntent("new")}
              />
              New floor plan
            </label>
            <label className={`flex items-center gap-2 cursor-pointer ${existingFloorPlans.length === 0 ? "opacity-40" : ""}`}>
              <input
                type="radio" name="intent" value="revision"
                checked={intent === "revision"}
                onChange={() => setIntent("revision")}
                disabled={existingFloorPlans.length === 0}
              />
              Revision to existing
            </label>
          </div>

          {/* New: building + floor */}
          {intent === "new" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="building" className="text-xs">Building</Label>
                <Input id="building" name="building" placeholder="A" required className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="floor" className="text-xs">Floor</Label>
                <Input id="floor" name="floor" type="number" placeholder="1" required className="h-8 text-sm" />
              </div>
            </div>
          )}

          {/* Revision: select existing floor plan */}
          {intent === "revision" && (
            <div className="space-y-1">
              <Label className="text-xs">Floor plan to revise</Label>
              <select
                value={floorPlanId}
                onChange={e => setFloorPlanId(e.target.value)}
                className="block w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
              >
                {existingFloorPlans.map(fp => (
                  <option key={fp.id} value={fp.id}>
                    Building {fp.building} — Floor {fp.floor}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                DXF must have been exported from this app (provenance marker required).
              </p>
            </div>
          )}

          {/* File upload */}
          <div className="space-y-1">
            <Label htmlFor="dxf" className="text-xs">DXF file</Label>
            <input
              ref={fileRef}
              id="dxf"
              name="dxf"
              type="file"
              accept=".dxf"
              required
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded file:border file:border-gray-300 file:text-xs file:bg-white file:hover:bg-gray-50 cursor-pointer"
            />
          </div>

          <Button type="submit" size="sm" disabled={step === "previewing"}>
            {step === "previewing" ? "Analysing…" : "Preview"}
          </Button>
        </form>
      </div>
    );
  }

  // ── Step: preview ──────────────────────────────────────────────────────────
  if (step === "preview" && preview) {
    const { diff, blocked } = preview;
    return (
      <div className="border rounded-md p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            Preview — Building {preview.building} Floor {preview.floor}
            <span className="ml-2 text-xs font-normal text-gray-500">
              ({preview.intent === "new" ? "new floor plan" : "revision"})
            </span>
          </h3>
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
        </div>

        {/* Diff summary */}
        <div className="text-xs space-y-1">
          <p className="text-gray-600">{diff.existingKept} existing spaces kept</p>
          {diff.newSpaces.length > 0 && (
            <p className="text-green-700">+{diff.newSpaces.length} new: {diff.newSpaces.join(", ")}</p>
          )}
          {diff.removedUnassigned.length > 0 && (
            <p className="text-amber-600">−{diff.removedUnassigned.length} removed (unassigned, OK): {diff.removedUnassigned.join(", ")}</p>
          )}
          {diff.removedAssigned.length > 0 && (
            <p className="text-red-600 font-medium">
              ✕ {diff.removedAssigned.length} assigned space{diff.removedAssigned.length !== 1 ? "s" : ""} would be removed — upload blocked:{" "}
              {diff.removedAssigned.join(", ")}
            </p>
          )}
        </div>

        {/* SVG preview */}
        <div
          className="border rounded bg-white overflow-auto"
          style={{ maxHeight: "50vh" }}
          dangerouslySetInnerHTML={{ __html: preview.svgContent }}
        />

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={handleCommit}
            disabled={blocked}
          >
            {blocked ? "Blocked — resolve conflicts first" : "Commit"}
          </Button>
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      </div>
    );
  }

  // ── Step: committing ────────────────────────────────────────────────────────
  if (step === "committing") {
    return (
      <div className="border rounded-md p-4">
        <p className="text-sm text-gray-500 animate-pulse">Committing…</p>
      </div>
    );
  }

  // ── Step: done ─────────────────────────────────────────────────────────────
  if (step === "done" && committed) {
    return (
      <div className="border rounded-md p-4 space-y-3">
        <p className="text-sm text-green-700 font-medium">Floor plan committed.</p>
        <p className="text-xs text-gray-500 font-mono">{committed.svgPath}</p>
        <div className="flex items-center gap-3">
          <a
            href={`/api/admin/floorplans/${committed.floorPlanId}/revisions/${committed.revisionId}/dxf`}
            download
            className="inline-flex items-center px-3 py-1.5 text-xs border rounded hover:bg-gray-50 font-medium"
          >
            Download labeled DXF
          </a>
          <a
            href={`/admin/floorplans/${committed.floorPlanId}`}
            className="text-xs text-blue-600 hover:underline"
          >
            View floor plan →
          </a>
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600">Upload another</button>
        </div>
        <p className="text-xs text-gray-400">
          Save the labeled DXF — it contains the provenance marker required for future revisions.
        </p>
      </div>
    );
  }

  // ── Step: error ─────────────────────────────────────────────────────────────
  const isMarkerError = errorMsg.includes("no provenance marker") || errorMsg.includes("marker check");
  return (
    <div className="border rounded-md p-4 space-y-3">
      <p className="text-sm text-red-600 font-medium">Upload failed</p>
      <pre className="text-xs bg-red-50 rounded p-3 whitespace-pre-wrap font-mono text-red-700">{errorMsg}</pre>
      {isMarkerError && intent === "revision" && floorPlanId && (
        <a
          href={`/admin/floorplans?skipMarkerFor=${floorPlanId}`}
          className="inline-block text-xs text-amber-700 hover:underline"
        >
          This is a pre-marker DXF — use bootstrap mode →
        </a>
      )}
      <button onClick={reset} className="block text-xs text-gray-500 hover:underline">← Try again</button>
    </div>
  );
}
