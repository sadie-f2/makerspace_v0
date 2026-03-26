import { prisma } from "@/lib/prisma";
import Link from "next/link";

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
  searchParams: Promise<{ entity?: string; actor?: string }>;
}) {
  const { entity, actor } = await searchParams;

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(entity ? { entityType: entity } : {}),
      ...(actor  ? { actorId: actor }     : {}),
    },
    orderBy: { timestamp: "desc" },
    take: 200,
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
  });

  const entityTypes = await prisma.auditLog.findMany({
    distinct: ["entityType"],
    select: { entityType: true },
    orderBy: { entityType: "asc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Audit Log</h2>
        <span className="text-sm text-gray-400">{logs.length} entries (most recent 200)</span>
      </div>

      {/* Filters */}
      <form className="flex gap-3 mb-4 text-sm">
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
        <button
          type="submit"
          className="px-3 py-1.5 border rounded hover:bg-gray-50"
        >
          Filter
        </button>
        {(entity || actor) && (
          <Link href="/admin/audit" className="px-3 py-1.5 text-gray-500 hover:underline">
            Clear
          </Link>
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
              <th className="px-4 py-2">Note</th>
              <th className="px-4 py-2">Diff</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No audit entries yet.
                </td>
              </tr>
            )}
            {logs.map(log => (
              <tr key={log.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2 whitespace-nowrap text-gray-500 text-xs">
                  {log.timestamp.toLocaleString()}
                </td>
                <td className="px-4 py-2">
                  {log.actor ? (
                    <Link
                      href={`/admin/members/${log.actor.id}?from=audit`}
                      className="hover:underline"
                    >
                      {log.actor.name}
                    </Link>
                  ) : (
                    <span className="text-gray-400">system</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-700"}`}>
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span className="font-medium">{log.entityType}</span>
                  <span className="ml-2 text-gray-400 text-xs font-mono">
                    {log.entityId.slice(0, 8)}…
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-600 max-w-xs truncate">
                  {log.note ?? ""}
                </td>
                <td className="px-4 py-2">
                  {(log.before || log.after) && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-blue-600 hover:underline">
                        view
                      </summary>
                      <div className="mt-2 space-y-1">
                        {log.before && (
                          <div>
                            <p className="font-medium text-gray-500">Before</p>
                            <pre className="bg-gray-50 rounded p-2 overflow-auto max-w-sm text-xs">
                              {JSON.stringify(log.before, null, 2)}
                            </pre>
                          </div>
                        )}
                        {log.after && (
                          <div>
                            <p className="font-medium text-gray-500">After</p>
                            <pre className="bg-gray-50 rounded p-2 overflow-auto max-w-sm text-xs">
                              {JSON.stringify(log.after, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
