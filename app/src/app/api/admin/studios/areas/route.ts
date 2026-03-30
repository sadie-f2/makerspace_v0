import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildAreaMap } from "@/lib/studioNaming";
import { requireAdminApi } from "@/lib/requireAdminApi";

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const studios = await prisma.resource.findMany({
    where: { typeTag: "studio_unit", deletedAt: null },
    select: { name: true },
  });
  const names = studios.map(s => s.name);
  const areaMap = buildAreaMap(names);
  const areas = Array.from(areaMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([token, maxN]) => ({ token, nextN: maxN + 1 }));
  return NextResponse.json({ areas, allNames: names });
}
