import Link from "next/link";
import { prisma } from "@/lib/prisma";
import StudioFloorPlan from "@/components/StudioFloorPlan";

export const dynamic = "force-dynamic";
export const metadata = { title: "Floor Map — Artisans Asylum" };

export default async function PublicMapPage() {
  const floorPlans = await prisma.floorPlan.findMany({
    select: { id: true, building: true, floor: true },
    orderBy: [{ building: "asc" }, { floor: "asc" }],
  });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-6 py-3 flex items-center justify-between shrink-0">
        <span className="font-semibold text-sm">Artisans Asylum</span>
        <Link href="/login" className="text-xs text-gray-500 hover:underline">
          Member login →
        </Link>
      </header>
      <main className="flex-1 px-6 py-6">
        <h2 className="text-lg font-semibold mb-1">Floor Map</h2>
        <p className="text-sm text-gray-500 mb-6">
          Hover a space to see who rents it.
        </p>
        {floorPlans.length === 0 ? (
          <p className="text-sm text-gray-400">No floor plans available yet.</p>
        ) : (
          <StudioFloorPlan floorPlans={floorPlans} />
        )}
      </main>
    </div>
  );
}
