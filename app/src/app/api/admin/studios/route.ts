import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { parseStudioName } from "@/lib/studioNaming";

export async function POST(req: Request) {
  const { name, unitIds }: { name: string; unitIds: string[] } = await req.json();

  // Validate name format
  if (!parseStudioName(name)) {
    return NextResponse.json({ error: "Name does not match convention (e.g. s10-1, sFIBER-2)" }, { status: 400 });
  }

  // Validate name uniqueness
  const existing = await prisma.resource.findFirst({
    where: { name, deletedAt: null },
  });
  if (existing) {
    return NextResponse.json({ error: `Studio name "${name}" is already taken` }, { status: 409 });
  }

  // Validate allowed unit count
  const allowed = await prisma.studioSize.findMany({ where: { active: true }, select: { unitCount: true } });
  const allowedCounts = allowed.map(s => s.unitCount);
  if (!allowedCounts.includes(unitIds.length)) {
    return NextResponse.json({
      error: `${unitIds.length} unit${unitIds.length !== 1 ? "s" : ""} selected — allowed: ${allowedCounts.sort((a, b) => a - b).join(", ")}`,
    }, { status: 400 });
  }

  // Validate all unitIds exist and are unlinked
  const spaces = await prisma.space.findMany({
    where: { externalId: { in: unitIds } },
    select: { externalId: true, resourceId: true },
  });
  const found = new Map(spaces.map(s => [s.externalId, s.resourceId]));
  const missing = unitIds.filter(id => !found.has(id));
  if (missing.length > 0) {
    return NextResponse.json({ error: `Units not found: ${missing.join(", ")}` }, { status: 400 });
  }
  const alreadyLinked = unitIds.filter(id => found.get(id) != null);
  if (alreadyLinked.length > 0) {
    return NextResponse.json({ error: `Units already assigned: ${alreadyLinked.join(", ")}` }, { status: 409 });
  }

  // Create resource + link spaces
  const resource = await prisma.resource.create({
    data: { name, typeTag: "studio_unit", leasable: true },
  });
  await prisma.space.updateMany({
    where: { externalId: { in: unitIds } },
    data: { resourceId: resource.id },
  });

  await audit({
    actorId: null,
    actorType: "SYSTEM",
    action: "create",
    entityType: "Resource",
    entityId: resource.id,
    after: { name, typeTag: "studio_unit", unitIds },
    note: "Studio created",
  });

  return NextResponse.json({ id: resource.id, name }, { status: 201 });
}
