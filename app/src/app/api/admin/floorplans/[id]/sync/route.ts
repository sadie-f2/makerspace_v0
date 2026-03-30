import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncFloorPlan } from "@/lib/syncFloorPlan";
import { requireAdminApi } from "@/lib/requireAdminApi";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { id } = await params;

  const fp = await prisma.floorPlan.findUnique({ where: { id } });
  if (!fp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const result = await syncFloorPlan(id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 422 });
  }
}
