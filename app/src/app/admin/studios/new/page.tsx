import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/requireStaff";
import StudioCreateForm from "@/components/StudioCreateForm";

export default async function NewStudioPage() {
  await requireStaff();
  const [floorPlans, existingStudios, allowedSizes] = await Promise.all([
    prisma.floorPlan.findMany({
      where: { spaces: { some: { blockType: "studio_unit" } } },
      select: { id: true, building: true, floor: true },
      orderBy: [{ building: "asc" }, { floor: "asc" }],
    }),
    prisma.resource.findMany({
      where: { typeTag: "studio_unit", deletedAt: null },
      select: { name: true },
    }),
    prisma.studioSize.findMany({
      where: { active: true },
      select: { unitCount: true },
      orderBy: { unitCount: "asc" },
    }),
  ]);

  return (
    <StudioCreateForm
      floorPlans={floorPlans}
      existingNames={existingStudios.map(s => s.name)}
      allowedCounts={allowedSizes.map(s => s.unitCount)}
    />
  );
}
