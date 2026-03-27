"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { parseStudioCSV, type ParsedStudioRow } from "@/lib/parseStudioCSV";

interface Props {
  unlinkedUnits: string[];
}

type PreviewRow = ParsedStudioRow;

export default function StudioImport({ unlinkedUnits }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [status, setStatus] = useState<"idle" | "committing" | "done" | "error">("idle");
  const [resultMsg, setResultMsg] = useState("");

  const knownUnits = new Set(unlinkedUnits);

  function handlePreview() {
    const rows = parseStudioCSV(text, knownUnits);
    setPreview(rows);
    setStatus("idle");
    setResultMsg("");
  }

  async function handleFileLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    const rows = parseStudioCSV(content, knownUnits);
    setPreview(rows);
  }

  async function handleCommit() {
    if (!preview) return;
    setStatus("committing");
    try {
      const res = await fetch("/api/admin/studios/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus("error");
        setResultMsg(json.error ?? "Unknown error");
        return;
      }
      setStatus("done");
      setResultMsg(`Created ${json.created} studios, ${json.assigned} assignments.`);
      setPreview(null);
      setText("");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setResultMsg(String(err));
    }
  }

  const hasErrors = preview?.some(r => r.errors.length > 0) ?? false;
  const validRows  = preview?.filter(r => r.errors.length === 0) ?? [];

  return (
    <div className="border rounded-md p-4">
      <h3 className="text-sm font-medium mb-1">Configure studios from CSV</h3>
      <p className="text-xs text-gray-400 mb-4">
        Columns: <span className="font-mono">studio_name, unit_ids, assignee_email (optional), monthly_rate (optional)</span>
        <br />
        For multiple units, quote the field: <span className="font-mono">"studio-2,studio-3"</span>. Single units need no quotes.
      </p>

      {/* Available unit IDs hint */}
      {unlinkedUnits.length > 0 && (
        <details className="mb-3 text-xs">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
            {unlinkedUnits.length} unconfigured unit IDs available
          </summary>
          <p className="mt-1 font-mono text-gray-400 leading-relaxed break-all">
            {unlinkedUnits.join(", ")}
          </p>
        </details>
      )}

      {/* File upload */}
      <div className="mb-3">
        <Label className="text-xs text-gray-500">Upload CSV file</Label>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFileLoad}
          className="block mt-1 w-full text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded file:border file:border-gray-300 file:text-xs file:bg-white file:hover:bg-gray-50 cursor-pointer"
        />
      </div>

      {/* Paste area */}
      <div className="mb-3">
        <Label className="text-xs text-gray-500">Or paste CSV</Label>
        <textarea
          value={text}
          onChange={e => { setText(e.target.value); setPreview(null); }}
          placeholder={"studio_name,unit_ids,assignee_email,monthly_rate\nStudio 101,studio-1,,75\nStudio 102,\"studio-2,studio-3\",member@example.com,75"}
          rows={6}
          className="mt-1 block w-full border rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-400 resize-y"
        />
      </div>

      <Button size="sm" variant="outline" onClick={handlePreview} disabled={!text.trim()}>
        Preview
      </Button>

      {/* Preview table */}
      {preview && preview.length > 0 && (
        <div className="mt-4">
          <div className="rounded-md border overflow-hidden mb-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b text-left text-gray-500 uppercase tracking-wide">
                  <th className="px-3 py-2">Studio</th>
                  <th className="px-3 py-2">Units</th>
                  <th className="px-3 py-2">Assignee</th>
                  <th className="px-3 py-2">Rate</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className={`border-b ${row.errors.length > 0 ? "bg-red-50" : row.warnings.length > 0 ? "bg-yellow-50" : ""}`}>
                    <td className="px-3 py-2 font-medium">{row.studioName || <span className="text-red-500">—</span>}</td>
                    <td className="px-3 py-2 font-mono">{row.unitIds.join(", ") || <span className="text-red-500">—</span>}</td>
                    <td className="px-3 py-2 text-gray-500">{row.assigneeEmail || "—"}</td>
                    <td className="px-3 py-2 text-gray-500">{row.monthlyRate ? `$${row.monthlyRate}` : "—"}</td>
                    <td className="px-3 py-2">
                      {row.errors.map((e, j) => (
                        <div key={j} className="text-red-600">{e}</div>
                      ))}
                      {row.warnings.map((w, j) => (
                        <div key={j} className="text-yellow-700">{w}</div>
                      ))}
                      {row.errors.length === 0 && row.warnings.length === 0 && (
                        <span className="text-green-600">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={handleCommit}
              disabled={validRows.length === 0 || status === "committing"}
            >
              {status === "committing" ? "Importing…" : `Commit ${validRows.length} row${validRows.length !== 1 ? "s" : ""}`}
            </Button>
            {hasErrors && (
              <span className="text-xs text-red-500">Rows with errors will be skipped.</span>
            )}
          </div>
        </div>
      )}

      {preview?.length === 0 && (
        <p className="mt-3 text-xs text-gray-400">No rows parsed — check your format.</p>
      )}

      {resultMsg && (
        <p className={`mt-3 text-xs ${status === "error" ? "text-red-600" : "text-green-600"}`}>
          {resultMsg}
        </p>
      )}
    </div>
  );
}
