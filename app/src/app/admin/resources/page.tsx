import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ResourceNode = {
  id: string;
  name: string;
  typeTag: string;
  reservable: boolean;
  leasable: boolean;
  reservationMode: string;
  requiresCertClass: { id: string; name: string } | null;
  children: ResourceNode[];
};

function ResourceRow({ node, depth }: { node: ResourceNode; depth: number }) {
  return (
    <>
      <tr className="border-b hover:bg-gray-50">
        <td className="py-2 px-4">
          <span style={{ paddingLeft: `${depth * 20}px` }} className="flex items-center gap-1">
            {depth > 0 && <span className="text-gray-300 mr-1">└</span>}
            <Link href={`/admin/resources/${node.id}`} className="font-medium hover:underline">
              {node.name}
            </Link>
          </span>
        </td>
        <td className="py-2 px-4">
          <Badge variant="outline" className="text-xs">{node.typeTag}</Badge>
        </td>
        <td className="py-2 px-4 text-sm text-gray-600">
          {node.reservable && <span className="mr-2">Reservable</span>}
          {node.leasable && <span>Leasable</span>}
          {!node.reservable && !node.leasable && <span className="text-gray-400">—</span>}
        </td>
        <td className="py-2 px-4">
          {node.requiresCertClass ? (
            <Link href={`/admin/equipment/${node.requiresCertClass.id}`} className="text-sm hover:underline text-blue-600">
              {node.requiresCertClass.name}
            </Link>
          ) : (
            <span className="text-gray-400 text-sm">—</span>
          )}
        </td>
      </tr>
      {node.children.map(child => (
        <ResourceRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export default async function ResourcesPage() {
  const all = await prisma.resource.findMany({
    where: { deletedAt: null },
    include: { requiresCertClass: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  // Build tree from flat list
  const byId = new Map(all.map(r => ({ ...r, children: [] as ResourceNode[] })).map(r => [r.id, r]));
  const roots: ResourceNode[] = [];
  for (const r of byId.values()) {
    if (r.parentId) {
      byId.get(r.parentId)?.children.push(r as ResourceNode);
    } else {
      roots.push(r as ResourceNode);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Resources</h2>
        <Link href="/admin/resources/new">
          <Button size="sm">+ New resource</Button>
        </Link>
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <th className="py-2 px-4">Name</th>
              <th className="py-2 px-4">Type</th>
              <th className="py-2 px-4">Flags</th>
              <th className="py-2 px-4">Cert required</th>
            </tr>
          </thead>
          <tbody>
            {roots.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-400">No resources yet.</td>
              </tr>
            )}
            {roots.map(r => (
              <ResourceRow key={r.id} node={r} depth={0} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
