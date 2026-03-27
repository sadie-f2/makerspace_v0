"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import FloorPlanViewer, { type ClickedSpace } from "@/components/FloorPlanViewer";
import { Badge } from "@/components/ui/badge";

interface Revision {
  id: string;
  svgPath: string;
  note: string | null;
  uploadedAt: string;
}

interface SpaceSummary {
  resourceId: string | null;
  occupantName: string | null;
}

interface FloorPlanData {
  id: string;
  building: string;
  floor: number;
  svgPath: string;
  spaces: SpaceSummary[];
  revisions: Revision[];
}

export default function FloorPlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<FloorPlanData | null>(null);
  const [activeSvgUrl, setActiveSvgUrl] = useState<string>("");
  const [isHistorical, setIsHistorical] = useState(false);
  const [selected, setSelected] = useState<ClickedSpace | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string>("");
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/floorplans/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: FloorPlanData) => {
        setData(d);
        setActiveSvgUrl(`/api/admin/floorplans/${id}/svg`);
      })
      .catch(() => setError(true));
  }, [id]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult("");
    const res = await fetch(`/api/admin/floorplans/${id}/sync`, { method: "POST" });
    const json = await res.json();
    setSyncing(false);
    setSyncResult(`${json.created} new, ${json.existing} existing, ${json.total} total`);
  }

  function switchRevision(rev: Revision) {
    // Historical revisions show static SVG without state overlay
    setActiveSvgUrl(rev.svgPath);
    setIsHistorical(rev.svgPath !== data?.svgPath);
    setSelected(null);
  }

  function switchToCurrent() {
    setActiveSvgUrl(`/api/admin/floorplans/${id}/svg`);
    setIsHistorical(false);
    setSelected(null);
  }

  if (error) return <p className="text-sm text-red-500">Floor plan not found.</p>;
  if (!data) return <p className="text-sm text-gray-400">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/floorplans" className="text-sm text-gray-500 hover:underline">
            ← Floor Plans
          </Link>
          <span className="text-gray-300">/</span>
          <h2 className="text-sm font-semibold">Building {data.building} — Floor {data.floor}</h2>
          {isHistorical && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">Historical view</Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isHistorical && (
            <button
              onClick={switchToCurrent}
              className="text-xs text-blue-600 hover:underline"
            >
              ← Back to current
            </button>
          )}
          <button
            onClick={handleSync}
            disabled={syncing || isHistorical}
            className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50 disabled:opacity-40"
          >
            {syncing ? "Syncing…" : "Sync spaces from SVG"}
          </button>
        </div>
      </div>

      {syncResult && (
        <p className="text-xs text-green-600 mb-3">{syncResult}</p>
      )}

      <div className="flex gap-6">
        {/* Floor plan viewer */}
        <div className="flex-1 min-w-0">
          <FloorPlanViewer
            svgUrl={activeSvgUrl}
            onSpaceClick={(space) => !isHistorical && setSelected(space)}
          />
        </div>

        {/* Side panel */}
        <div className="w-64 shrink-0 space-y-4">
          {/* Space detail / click panel */}
          {!isHistorical && (
            selected ? (
              <div className="border rounded p-4 text-sm">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-medium">
                    {selected.resourceName ?? selected.externalId}
                  </h3>
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                </div>
                <dl className="space-y-2 text-xs">
                  <div>
                    <dt className="text-gray-400">Space ID</dt>
                    <dd className="font-mono break-all">{selected.externalId}</dd>
                  </div>
                  {selected.type && (
                    <div>
                      <dt className="text-gray-400">Type</dt>
                      <dd>{selected.type}</dd>
                    </div>
                  )}
                  {selected.occupantName ? (
                    <div>
                      <dt className="text-gray-400">Occupant</dt>
                      <dd className="font-medium">{selected.occupantName}</dd>
                    </div>
                  ) : selected.resourceId ? (
                    <div>
                      <dt className="text-gray-400">Status</dt>
                      <dd className="text-green-600">Vacant</dd>
                    </div>
                  ) : (
                    <div>
                      <dt className="text-gray-400">Status</dt>
                      <dd className="text-amber-600">Not linked to resource</dd>
                    </div>
                  )}
                  {selected.resourceId && (
                    <div className="pt-2">
                      <Link href={`/admin/resources/${selected.resourceId}`} className="text-blue-600 hover:underline">
                        View resource →
                      </Link>
                    </div>
                  )}
                </dl>
              </div>
            ) : (
              <div className="border rounded p-4 text-xs text-gray-400">
                Click a space to see details.
              </div>
            )
          )}

          {/* Space counts */}
          {data.spaces.length > 0 && !isHistorical && (
            <div className="border rounded p-3 text-xs space-y-1">
              <p className="font-medium text-gray-600 mb-2">Summary</p>
              <p>{data.spaces.length} spaces synced</p>
              <p>{data.spaces.filter(s => s.occupantName).length} occupied</p>
              <p>{data.spaces.filter(s => !s.occupantName && s.resourceId).length} vacant</p>
              <p>{data.spaces.filter(s => !s.resourceId).length} unlinked</p>
            </div>
          )}

          {/* Revisions */}
          {data.revisions.length > 0 && (
            <div className="border rounded p-3 text-xs">
              <p className="font-medium text-gray-600 mb-2">Revisions ({data.revisions.length})</p>
              <ul className="space-y-2">
                {data.revisions.map((rev, i) => {
                  const isCurrent = !isHistorical && i === 0;
                  return (
                    <li
                      key={rev.id}
                      className={`flex items-start justify-between gap-2 ${isCurrent ? "text-gray-800" : "text-gray-400"}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate">{rev.note ?? `Revision ${data.revisions.length - i}`}</p>
                        <p className="text-gray-400">{new Date(rev.uploadedAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {i === 0 && <Badge variant="outline" className="text-xs py-0">current</Badge>}
                        {!isCurrent && (
                          <button
                            onClick={() => i === 0 ? switchToCurrent() : switchRevision(rev)}
                            className="text-blue-500 hover:underline"
                          >
                            view
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
