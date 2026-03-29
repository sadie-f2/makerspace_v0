"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export interface UnlinkedSpace {
  externalId: string;
  blockType:  string;
  bayCode:    string | null;
  shelfLevel: number | null;
}

interface TypeInfo {
  label:             string;
  defaultMonthlyRate: string | null; // serialised Decimal
}

interface Props {
  unlinkedSpaces: UnlinkedSpace[];
  typeLabels:     Record<string, TypeInfo>;
}

function suggestName(space: UnlinkedSpace, typeLabel: string): string {
  if (space.bayCode && space.shelfLevel != null) {
    return `${typeLabel} ${space.bayCode} L${space.shelfLevel}`;
  }
  if (space.bayCode) {
    return `${typeLabel} ${space.bayCode}`;
  }
  return `${typeLabel} ${space.externalId}`;
}

export default function StorageImport({ unlinkedSpaces, typeLabels }: Props) {
  const router  = useRouter();
  const [open, setOpen]     = useState(false);
  const [names, setNames]   = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const s of unlinkedSpaces) {
      const label = typeLabels[s.blockType]?.label ?? s.blockType;
      m[s.externalId] = suggestName(s, label);
    }
    return m;
  });
  const [selected, setSelected] = useState<Set<string>>(() => new Set(unlinkedSpaces.map(s => s.externalId)));
  const [status,  setStatus]    = useState<"idle" | "saving" | "done" | "error">("idle");
  const [msg,     setMsg]       = useState("");

  // Group by blockType for display
  const groups = useMemo(() => {
    const m = new Map<string, UnlinkedSpace[]>();
    for (const s of unlinkedSpaces) {
      (m.get(s.blockType) ?? (m.set(s.blockType, []), m.get(s.blockType)!)).push(s);
    }
    return m;
  }, [unlinkedSpaces]);

  function toggleAll(blockType: string, spaces: UnlinkedSpace[]) {
    const ids = spaces.map(s => s.externalId);
    const allOn = ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allOn) ids.forEach(id => next.delete(id));
      else       ids.forEach(id => next.add(id));
      return next;
    });
  }

  function toggle(externalId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(externalId)) next.delete(externalId);
      else next.add(externalId);
      return next;
    });
  }

  async function handleCreate() {
    const items = unlinkedSpaces
      .filter(s => selected.has(s.externalId))
      .map(s => ({
        spaceExternalId: s.externalId,
        name:    names[s.externalId] ?? suggestName(s, typeLabels[s.blockType]?.label ?? s.blockType),
        typeTag: s.blockType,
      }));
    if (items.length === 0) return;
    setStatus("saving");
    try {
      const res  = await fetch("/api/admin/storage/import", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ items }),
      });
      const json = await res.json();
      if (!res.ok) { setStatus("error"); setMsg(json.error ?? "Unknown error"); return; }
      setStatus("done");
      setMsg(`Created ${json.created} storage resource${json.created !== 1 ? "s" : ""}.`);
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMsg(String(err));
    }
  }

  const selectedCount = [...selected].filter(id => unlinkedSpaces.some(s => s.externalId === id)).length;

  if (unlinkedSpaces.length === 0) return null;

  return (
    <div className="border rounded-md overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-sm font-medium text-left border-amber-200"
      >
        <span className="text-amber-800">
          {unlinkedSpaces.length} unlinked space{unlinkedSpaces.length !== 1 ? "s" : ""} — configure to make rentable
        </span>
        <span className="text-amber-500 text-xs">{open ? "▲ hide" : "▼ show"}</span>
      </button>

      {open && (
        <div className="p-4">
          <p className="text-xs text-gray-500 mb-4">
            Each space below will become an independently-rentable storage unit.
            Names can be edited before creating.
          </p>

          {[...groups.entries()].map(([blockType, spaces]) => {
            const label = typeLabels[blockType]?.label ?? blockType;
            const allOn = spaces.every(s => selected.has(s.externalId));
            return (
              <div key={blockType} className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="checkbox"
                    checked={allOn}
                    onChange={() => toggleAll(blockType, spaces)}
                    className="rounded"
                  />
                  <span className="text-xs font-medium text-gray-700">{label} ({spaces.length})</span>
                </div>
                <div className="rounded border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b text-gray-500 uppercase tracking-wide">
                        <th className="w-8 px-3 py-1.5"></th>
                        {spaces.some(s => s.bayCode) && <th className="px-3 py-1.5 text-left">Bay</th>}
                        {spaces.some(s => s.shelfLevel != null) && <th className="px-3 py-1.5 text-left">Level</th>}
                        <th className="px-3 py-1.5 text-left">Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {spaces.map(s => (
                        <tr key={s.externalId} className="border-b last:border-0">
                          <td className="px-3 py-1.5">
                            <input
                              type="checkbox"
                              checked={selected.has(s.externalId)}
                              onChange={() => toggle(s.externalId)}
                              className="rounded"
                            />
                          </td>
                          {spaces.some(s2 => s2.bayCode) && (
                            <td className="px-3 py-1.5 font-mono text-gray-500">{s.bayCode ?? "—"}</td>
                          )}
                          {spaces.some(s2 => s2.shelfLevel != null) && (
                            <td className="px-3 py-1.5 text-gray-500">{s.shelfLevel != null ? `L${s.shelfLevel}` : "—"}</td>
                          )}
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              value={names[s.externalId] ?? ""}
                              onChange={e => setNames(n => ({ ...n, [s.externalId]: e.target.value }))}
                              className="w-full border rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          <div className="flex items-center gap-3 mt-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={selectedCount === 0 || status === "saving"}
            >
              {status === "saving" ? "Creating…" : `Create ${selectedCount} resource${selectedCount !== 1 ? "s" : ""}`}
            </Button>
            {msg && (
              <span className={`text-xs ${status === "error" ? "text-red-600" : "text-green-600"}`}>{msg}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
