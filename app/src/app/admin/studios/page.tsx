import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import StudioImport from "@/components/StudioImport";
import StudioFloorPlan from "@/components/StudioFloorPlan";

export default async function StudiosPage() {
  const [studios, unlinkedSpaces, floorPlans] = await Promise.all([
    prisma.resource.findMany({
      where: { typeTag: { in: ["studio_unit", "studio"] }, deletedAt: null },
      include: {
        spaces: { select: { id: true, externalId: true } },
        rentals: {
          where: { deletedAt: null, endDate: null },
          include: { member: { select: { id: true, name: true } } },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.space.findMany({
      where: { blockType: "studio_unit", resourceId: null },
      select: { externalId: true },
      orderBy: { externalId: "asc" },
    }),
    // Floor plans that have at least one studio_unit space
    prisma.floorPlan.findMany({
      where: {
        spaces: { some: { blockType: "studio_unit" } },
      },
      select: { id: true, building: true, floor: true },
      orderBy: [{ building: "asc" }, { floor: "asc" }],
    }),
  ]);

  const occupied = studios.filter(s => s.rentals.length > 0);
  const vacant   = studios.filter(s => s.rentals.length === 0);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Studios</h2>
        <div className="flex items-center gap-4">
          <div className="flex gap-2 text-xs text-gray-500">
            <span>{occupied.length} occupied</span>
            <span>·</span>
            <span>{vacant.length} vacant</span>
            <span>·</span>
            <span>{unlinkedSpaces.length} unconfigured units</span>
          </div>
          <Link href="/admin/studios/new">
            <Button size="sm">New studio</Button>
          </Link>
        </div>
      </div>

      {/* Inline floor plan viewer */}
      <StudioFloorPlan floorPlans={floorPlans} />

      {/* Studio list */}
      {studios.length > 0 ? (
        <div className="rounded-md border divide-y mb-8">
          {studios.map(s => {
            const tenant = s.rentals[0]?.member;
            return (
              <div key={s.id} id={`resource-${s.id}`} className="flex items-center justify-between px-4 py-3 text-sm transition-colors">
                <div>
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {s.spaces.length} unit{s.spaces.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {tenant ? (
                    <Link href={`/admin/members/${tenant.id}`} className="text-gray-600 hover:underline text-xs">
                      {tenant.name}
                    </Link>
                  ) : (
                    <Badge variant="outline" className="text-green-700 border-green-300">Vacant</Badge>
                  )}
                  <Link href={`/admin/studios/${s.id}`}>
                    <span className="text-xs text-gray-400 hover:underline">edit</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-400 mb-8">No studios configured yet. Use the import panel below to define studios from floor plan units.</p>
      )}

      <StudioImport unlinkedUnits={unlinkedSpaces.map(s => s.externalId)} />
    </div>
  );
}
