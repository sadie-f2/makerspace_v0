import Link from "next/link";
import { prisma } from "@/lib/prisma";
import StudioFloorPlan from "@/components/StudioFloorPlan";

export default async function MapPage() {
  const floorPlans = await prisma.floorPlan.findMany({
    select: { id: true, building: true, floor: true },
    orderBy: [{ building: "asc" }, { floor: "asc" }],
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Map</h2>
        <Link href="/map" className="text-xs text-gray-400 hover:underline">
          Public link →
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Hover a space to see who rents it.
      </p>
      {floorPlans.length === 0 ? (
        <p className="text-sm text-gray-400">No floor plans available yet.</p>
      ) : (
        <StudioFloorPlan floorPlans={floorPlans} />
      )}
    </div>
  );
}
