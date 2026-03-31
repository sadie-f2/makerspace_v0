import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireStaff } from "@/lib/requireStaff";
import { isUndoable, isForceRevertEligible, applyUndo, UNDO_WINDOW_MS } from "@/lib/undo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ForceRevertButton from "@/components/ForceRevertButton";

const ACTION_COLORS: Record<string, string> = {
  create:  "bg-green-100 text-green-800",
  update:  "bg-blue-100 text-blue-800",
  delete:  "bg-red-100 text-red-800",
  restore: "bg-yellow-100 text-yellow-800",
  undo:    "bg-purple-100 text-purple-800",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    entity?: string;
    entityId?: string;
    actor?: string;
    undoError?: string;
    flagged?: string;
  }>;
}) {
  await requireStaff();
  const session = await auth();
  const { entity, entityId, actor, undoError, flagged } = await searchParams;

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(entity   ? { entityType: entity }   : {}),
      ...(entityId ? { entityId }              : {}),
      ...(actor    ? { actorId: actor }        : {}),
      ...(flagged  ? { flagNote: { not: null } } : {}),
    },
    orderBy: { timestamp: "desc" },
    take: 200,
    include: {
      actor:  { select: { id: true, name: true, email: true } },
      undoOf: { select: { id: true, action: true, entityType: true } },
      undone: { select: { id: true } },
    },
  });

  const entityTypes = await prisma.auditLog.findMany({
    distinct: ["entityType"],
    select:   { entityType: true },
    orderBy:  { entityType: "asc" },
  });

  // ── Server actions ──────────────────────────────────────────────────────────

  async function undoAction(formData: FormData) {
    "use server";
    const session = await auth();
    const logId = formData.get("logId") as string;
    const result = await applyUndo(logId, session!.user.id);
    if (!result.ok) {
      redirect(`/admin/audit?undoError=${encodeURIComponent(result.reason)}`);
    }
    redirect("/admin/audit");
  }

  async function forceRevertAction(formData: FormData) {
    "use server";
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      redirect(`/admin/audit?undoError=${encodeURIComponent("Force revert requires ADMIN role")}`);
    }
    const logId = formData.get("logId") as string;
    const result = await applyUndo(logId, session!.user.id, { force: true });
    if (!result.ok) {
      redirect(`/admin/audit?undoError=${encodeURIComponent(result.reason)}`);
    }
    redirect("/admin/audit");
  }

  async function flagEntry(formData: FormData) {
    "use server";
    const logId    = formData.get("logId") as string;
    const flagNote = (formData.get("flagNote") as string).trim();
    if (!flagNote) return;
    await prisma.auditLog.update({ where: { id: logId }, data: { flagNote } });
    redirect("/admin/audit");
  }

  async function clearFlag(formData: FormData) {
    "use server";
    const logId = formData.get("logId") as string;
    await prisma.auditLog.update({ where: { id: logId }, data: { flagNote: null } });
    redirect("/admin/audit");
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const now = Date.now();
  const undoWindowLabel = `${UNDO_WINDOW_MS / 60_000} min`;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          {entityId ? `History — ${entity ?? "Entity"} ${entityId.slice(0, 8)}…` : "Audit Log"}
        </h2>
        <span className="text-sm text-gray-400">{logs.length} entries (most recent 200)</span>
      </div>

      {undoError && (
        <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          Undo failed: {undoError}
        </div>
      )}

      {/* Filters */}
      <form className="flex flex-wrap gap-3 mb-4 text-sm items-center">
        <select
          name="entity"
          defaultValue={entity ?? ""}
          className="border rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
        >
          <option value="">All entity types</option>
          {entityTypes.map(e => (
            <option key={e.entityType} value={e.entityType}>{e.entityType}</option>
          ))}
        </select>
        <Input
          name="entityId"
          defaultValue={entityId ?? ""}
          placeholder="Entity ID (exact)"
          className="h-8 text-sm w-56"
        />
        <Input
          name="actor"
          defaultValue={actor ?? ""}
          placeholder="Actor ID (exact)"
          className="h-8 text-sm w-56"
        />
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" name="flagged" value="1" defaultChecked={!!flagged} className="rounded" />
          Flagged only
        </label>
        <Button type="submit" size="sm" variant="outline">Filter</Button>
        {(entity || entityId || actor || flagged) && (
          <Link href="/admin/audit" className="text-sm text-gray-500 hover:underline">Clear</Link>
        )}
      </form>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2">Time</th>
              <th className="px-4 py-2">Actor</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Entity</th>
              <th className="px-4 py-2">Note / Flag</th>
              <th className="px-4 py-2">Diff</th>
              <th className="px-4 py-2">Controls</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No audit entries.
                </td>
              </tr>
            )}
            {logs.map(log => {
              const eligible   = isUndoable(log);
              const alreadyDone = log.undone.length > 0;
              const ageMs      = now - new Date(log.timestamp).getTime();
              const minsLeft   = Math.max(0, Math.ceil((UNDO_WINDOW_MS - ageMs) / 60_000));

              return (
                <tr key={log.id} className={`hover:bg-gray-50 ${log.flagNote ? "bg-red-50/40" : ""}`}>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-500 text-xs">
                    {log.timestamp.toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    {log.actor ? (
                      <Link href={`/admin/members/${log.actor.id}`} className="hover:underline">
                        {log.actor.name}
                      </Link>
                    ) : (
                      <span className="text-gray-400 italic">
                        {log.actorType === "SYSTEM" ? "system" : "unknown"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-700"}`}>
                      {log.action}
                    </span>
                    {log.undoOf && (
                      <span className="ml-1 text-xs text-purple-500">
                        ↩ <Link href={`/admin/audit?entityId=${log.undoOf.id}`} className="hover:underline">orig</Link>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/admin/audit?entity=${log.entityType}&entityId=${log.entityId}`}
                      className="font-medium hover:underline"
                    >
                      {log.entityType}
                    </Link>
                    <span className="ml-2 text-gray-400 text-xs font-mono">
                      {log.entityId.slice(0, 8)}…
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs max-w-xs">
                    {log.note && <p className="text-gray-600 truncate">{log.note}</p>}
                    {log.flagNote && (
                      <p className="text-red-600 font-medium mt-0.5">⚑ {log.flagNote}</p>
                    )}
                    {!log.flagNote && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-gray-400 hover:text-gray-600">add flag</summary>
                        <form action={flagEntry} className="flex gap-1 mt-1">
                          <input type="hidden" name="logId" value={log.id} />
                          <Input name="flagNote" placeholder="Error note…" className="h-6 text-xs w-36" />
                          <Button type="submit" size="sm" className="h-6 text-xs px-2">Flag</Button>
                        </form>
                      </details>
                    )}
                    {log.flagNote && (
                      <form action={clearFlag} className="mt-1">
                        <input type="hidden" name="logId" value={log.id} />
                        <Button type="submit" size="sm" variant="ghost" className="h-5 text-xs text-gray-400 px-1">
                          clear flag
                        </Button>
                      </form>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {(log.before || log.after) && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-blue-600 hover:underline">view</summary>
                        <div className="mt-2 space-y-1">
                          {log.before && (
                            <div>
                              <p className="font-medium text-gray-500">Before</p>
                              <pre className="bg-gray-50 rounded p-2 overflow-auto max-w-xs text-xs">
                                {JSON.stringify(log.before, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.after && (
                            <div>
                              <p className="font-medium text-gray-500">After</p>
                              <pre className="bg-gray-50 rounded p-2 overflow-auto max-w-xs text-xs">
                                {JSON.stringify(log.after, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {alreadyDone ? (
                      <span className="text-xs text-purple-500 italic">undone</span>
                    ) : eligible ? (
                      <form action={undoAction}>
                        <input type="hidden" name="logId" value={log.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs"
                          title={`Undo window closes in ${minsLeft} min`}
                        >
                          Undo ({minsLeft}m)
                        </Button>
                      </form>
                    ) : isForceRevertEligible(log) ? (
                      session?.user?.role === "ADMIN" ? (
                        <ForceRevertButton logId={log.id} action={forceRevertAction} />
                      ) : (
                        <span className="text-xs text-gray-300">expired</span>
                      )
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Undo available within {undoWindowLabel} for eligible actions. Actions outside this window
        or with external effects (Stripe, Brivo) require manual correction — use the flag to record steps taken.
      </p>
    </div>
  );
}
