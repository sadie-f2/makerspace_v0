import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/requireAdminApi";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; revId: string }> }
) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { id, revId } = await params;

  const revision = await prisma.floorPlanRevision.findFirst({
    where: { id: revId, floorPlanId: id },
    select: { id: true, dxfData: true, floorPlan: { select: { building: true, floor: true } } },
  });

  if (!revision) {
    return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  }
  if (!revision.dxfData) {
    return NextResponse.json({ error: "No DXF stored for this revision (uploaded before v2 upload flow)" }, { status: 404 });
  }

  const filename = `${revision.floorPlan.building}_${revision.floorPlan.floor}.${revision.id}.dxf`;

  return new Response(revision.dxfData, {
    headers: {
      "Content-Type":        "application/dxf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
    },
  });
}
