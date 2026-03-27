import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import FloorPlanUpload from "@/components/FloorPlanUpload";

export default async function FloorPlansPage() {
  const floorPlans = await prisma.floorPlan.findMany({
    orderBy: [{ building: "asc" }, { floor: "asc" }],
    include: { _count: { select: { spaces: true } } },
  });

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Floor Plans</h2>
      </div>

      {floorPlans.length === 0 ? (
        <p className="text-sm text-gray-400 mb-8">No floor plans registered yet.</p>
      ) : (
        <div className="rounded-md border mb-8 divide-y">
          {floorPlans.map(fp => (
            <div key={fp.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="font-medium text-sm">Building {fp.building} — Floor {fp.floor}</span>
                <span className="ml-3 text-xs text-gray-400 font-mono">{fp.svgPath}</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline">{fp._count.spaces} spaces</Badge>
                <Link href={`/admin/floorplans/${fp.id}`}>
                  <Button size="sm" variant="outline">View</Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <FloorPlanUpload />
    </div>
  );
}
