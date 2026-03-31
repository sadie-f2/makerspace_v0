import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/requireStaff";
import { Badge } from "@/components/ui/badge";
import StorageFloorPlan from "@/components/StorageFloorPlan";
import StorageImport, { type UnlinkedSpace } from "@/components/StorageImport";

export default async function StoragePage() {
  await requireStaff();
  // Resolve storage type slugs dynamically from SpaceTypeConfig
  const storageParent = await prisma.spaceTypeConfig.findUnique({ where: { slug: "storage_unit" } });
  const storageTypeConfigs = storageParent
    ? await prisma.spaceTypeConfig.findMany({
        where: { OR: [{ id: storageParent.id }, { parentId: storageParent.id }] },
        select: { slug: true, label: true, defaultMonthlyRate: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
      })
    : [];
  const storageSlugs = storageTypeConfigs.map(t => t.slug);

  // Type label + default rate lookup (serialize Decimal → string for client)
  const typeLabels: Record<string, { label: string; defaultMonthlyRate: string | null }> =
    Object.fromEntries(
      storageTypeConfigs.map(t => [
        t.slug,
        { label: t.label, defaultMonthlyRate: t.defaultMonthlyRate?.toString() ?? null },
      ])
    );

  if (storageSlugs.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-4">Storage</h2>
        <p className="text-sm text-gray-500">
          No storage space types configured.{" "}
          <Link href="/admin/settings/space-types" className="underline">
            Configure space types
          </Link>{" "}
          first.
        </p>
      </div>
    );
  }

  const [resources, unlinkedSpaces, floorPlans] = await Promise.all([
    prisma.resource.findMany({
      where: { typeTag: { in: storageSlugs }, deletedAt: null },
      include: {
        spaces: {
          select: { id: true, externalId: true, bayCode: true, shelfLevel: true, blockType: true },
          take: 1,
        },
        rentals: {
          where: { deletedAt: null, endDate: null },
          include: { member: { select: { id: true, name: true } } },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.space.findMany({
      where: { blockType: { in: storageSlugs }, resourceId: null },
      select: { externalId: true, blockType: true, bayCode: true, shelfLevel: true },
      orderBy: [{ blockType: "asc" }, { bayCode: "asc" }, { shelfLevel: "asc" }],
    }),
    prisma.floorPlan.findMany({
      where: { spaces: { some: { blockType: { in: storageSlugs } } } },
      select: { id: true, building: true, floor: true },
      orderBy: [{ building: "asc" }, { floor: "asc" }],
    }),
  ]);

  const assigned = resources.filter(r => r.rentals.length > 0);
  const vacant   = resources.filter(r => r.rentals.length === 0);

  // Group resources by typeTag in SpaceTypeConfig sort order
  const typeOrder = storageTypeConfigs.map(t => t.slug);
  const grouped = new Map<string, typeof resources>(typeOrder.map(slug => [slug, []]));
  for (const r of resources) {
    (grouped.get(r.typeTag) ?? grouped.set(r.typeTag, []).get(r.typeTag)!).push(r);
  }
  // Sort each group: bay code alpha, then shelf level numeric
  for (const [, group] of grouped) {
    group.sort((a, b) => {
      const spA = a.spaces[0];
      const spB = b.spaces[0];
      if (spA?.bayCode && spB?.bayCode) {
        if (spA.bayCode !== spB.bayCode) return spA.bayCode.localeCompare(spB.bayCode);
        return (spA.shelfLevel ?? 0) - (spB.shelfLevel ?? 0);
      }
      return a.name.localeCompare(b.name);
    });
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Storage</h2>
        <div className="flex gap-2 text-xs text-gray-500">
          <span>{resources.length} total</span>
          <span>·</span>
          <span>{assigned.length} assigned</span>
          <span>·</span>
          <span>{vacant.length} vacant</span>
          {unlinkedSpaces.length > 0 && (
            <>
              <span>·</span>
              <span className="text-amber-600">{unlinkedSpaces.length} unlinked</span>
            </>
          )}
        </div>
      </div>

      <StorageFloorPlan floorPlans={floorPlans} />

      {resources.length > 0 ? (
        <div className="space-y-6 mb-8">
          {[...grouped.entries()]
            .filter(([, group]) => group.length > 0)
            .map(([slug, group]) => {
              const typeLabel = typeLabels[slug]?.label ?? slug;
              return (
                <div key={slug}>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    {typeLabel}
                    <span className="ml-2 text-xs font-normal text-gray-400">{group.length}</span>
                  </h3>
                  <div className="rounded-md border divide-y text-sm">
                    {group.map(r => {
                      const space  = r.spaces[0];
                      const tenant = r.rentals[0]?.member;
                      const rate   = r.rentals[0]?.monthlyRate?.toString()
                        ?? typeLabels[r.typeTag]?.defaultMonthlyRate;
                      return (
                        <div
                          key={r.id}
                          id={`resource-${r.id}`}
                          className="flex items-center justify-between px-4 py-2.5 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-medium truncate">{r.name}</span>
                            {space?.bayCode && (
                              <span className="font-mono text-xs text-gray-400 shrink-0">{space.bayCode}</span>
                            )}
                            {space?.shelfLevel != null && (
                              <span className="text-xs text-gray-400 shrink-0">L{space.shelfLevel}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-4">
                            {rate && (
                              <span className="text-xs text-gray-400">${rate}/mo</span>
                            )}
                            {tenant ? (
                              <Link
                                href={`/admin/members/${tenant.id}`}
                                className="text-xs text-gray-600 hover:underline"
                              >
                                {tenant.name}
                              </Link>
                            ) : (
                              <Badge variant="outline" className="text-green-700 border-green-300 text-xs">
                                Vacant
                              </Badge>
                            )}
                            <Link href={`/admin/storage/${r.id}`} className="text-xs text-gray-400 hover:underline">
                              edit
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
        <p className="text-sm text-gray-400 mb-8">
          No storage units configured yet.
          {unlinkedSpaces.length > 0
            ? " Use the panel below to create resources from floor plan spaces."
            : " Import a floor plan with storage spaces first."}
        </p>
      )}

      <StorageImport
        unlinkedSpaces={unlinkedSpaces as UnlinkedSpace[]}
        typeLabels={typeLabels}
      />
    </div>
  );
}
