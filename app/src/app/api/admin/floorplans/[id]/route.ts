import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const fp = await prisma.floorPlan.findUnique({
    where: { id },
    include: {
      spaces: {
        include: {
          resource: {
            select: {
              id: true,
              name: true,
              rentals: {
                where: { deletedAt: null, endDate: null },
                select: { member: { select: { name: true } } },
                orderBy: { startDate: "desc" },
                take: 1,
              },
            },
          },
        },
      },
      revisions: {
        orderBy: { uploadedAt: "desc" },
        select: { id: true, svgPath: true, note: true, uploadedAt: true },
      },
    },
  });

  if (!fp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const spaces = fp.spaces.map(s => ({
    externalId: s.externalId,
    name: s.name,
    blockType: s.blockType,
    resourceId: s.resourceId,
    resourceName: s.resource?.name ?? null,
    occupantName: s.resource?.rentals[0]?.member.name ?? null,
  }));

  return NextResponse.json({
    id: fp.id,
    building: fp.building,
    floor: fp.floor,
    svgPath: fp.svgPath,
    spaces,
    revisions: fp.revisions.map(r => ({
      id: r.id,
      svgPath: r.svgPath,
      note: r.note,
      uploadedAt: r.uploadedAt,
    })),
  });
}
