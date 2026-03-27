import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import StudioEditForm from "@/components/StudioEditForm";

export default async function StudioEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [studio, allowedSizes, otherStudios] = await Promise.all([
    prisma.resource.findUnique({
      where: { id, deletedAt: null },
      include: {
        spaces: {
          select: { externalId: true, floorPlanId: true },
        },
      },
    }),
    prisma.studioSize.findMany({
      where: { active: true },
      select: { unitCount: true },
      orderBy: { unitCount: "asc" },
    }),
    prisma.resource.findMany({
      where: { typeTag: "studio_unit", deletedAt: null, id: { not: id } },
      select: { name: true },
    }),
  ]);

  if (!studio || studio.typeTag !== "studio_unit") notFound();

  // Determine floor plan from current spaces (use first space's floor plan)
  // Fall back to first floor plan with studio units if studio has no spaces yet
  const floorPlanId =
    studio.spaces[0]?.floorPlanId ??
    (await prisma.floorPlan.findFirst({
      where: { spaces: { some: { blockType: "studio_unit" } } },
      select: { id: true },
    }))?.id;

  if (!floorPlanId) notFound();

  return (
    <StudioEditForm
      studio={{
        id: studio.id,
        name: studio.name,
        currentUnitIds: studio.spaces.map(s => s.externalId),
      }}
      floorPlanId={floorPlanId}
      allowedCounts={allowedSizes.map(s => s.unitCount)}
      existingNames={otherStudios.map(s => s.name)}
    />
  );
}
