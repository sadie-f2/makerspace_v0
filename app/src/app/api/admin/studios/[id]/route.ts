import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { parseStudioName } from "@/lib/studioNaming";
import { requireAdminApi } from "@/lib/requireAdminApi";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { id } = await params;
  const { unitIds, name }: { unitIds: string[]; name?: string } = await req.json();

  // Validate name if provided
  if (name !== undefined) {
    if (!parseStudioName(name)) {
      return NextResponse.json({ error: "Name does not match convention (e.g. s10-1, sFIBER-2)" }, { status: 400 });
    }
    const taken = await prisma.resource.findFirst({ where: { name, deletedAt: null, id: { not: id } } });
    if (taken) return NextResponse.json({ error: `Name "${name}" is already taken` }, { status: 409 });
  }

  const studio = await prisma.resource.findUnique({
    where: { id, deletedAt: null },
    include: { spaces: { select: { externalId: true, resourceId: true } } },
  });
  if (!studio) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Validate allowed unit count
  const allowed = await prisma.studioSize.findMany({ where: { active: true }, select: { unitCount: true } });
  const allowedCounts = allowed.map(s => s.unitCount);
  if (!allowedCounts.includes(unitIds.length)) {
    return NextResponse.json({
      error: `${unitIds.length} unit${unitIds.length !== 1 ? "s" : ""} selected — allowed: ${allowedCounts.sort((a, b) => a - b).join(", ")}`,
    }, { status: 400 });
  }

  // Validate new units exist and are unlinked (or belong to this studio)
  const spaces = await prisma.space.findMany({
    where: { externalId: { in: unitIds } },
    select: { externalId: true, resourceId: true },
  });
  const found = new Map(spaces.map(s => [s.externalId, s.resourceId]));
  const missing = unitIds.filter(e => !found.has(e));
  if (missing.length > 0) return NextResponse.json({ error: `Units not found: ${missing.join(", ")}` }, { status: 400 });
  const conflict = unitIds.filter(e => found.get(e) != null && found.get(e) !== id);
  if (conflict.length > 0) return NextResponse.json({ error: `Units assigned to another studio: ${conflict.join(", ")}` }, { status: 409 });

  const prevIds = studio.spaces.map(s => s.externalId);
  const nextSet = new Set(unitIds);
  const prevSet = new Set(prevIds);

  // Unlink removed units
  const toRemove = prevIds.filter(e => !nextSet.has(e));
  if (toRemove.length > 0) {
    await prisma.space.updateMany({ where: { externalId: { in: toRemove } }, data: { resourceId: null } });
  }
  // Link added units
  const toAdd = unitIds.filter(e => !prevSet.has(e));
  if (toAdd.length > 0) {
    await prisma.space.updateMany({ where: { externalId: { in: toAdd } }, data: { resourceId: id } });
  }
  // Rename if requested
  if (name && name !== studio.name) {
    await prisma.resource.update({ where: { id }, data: { name } });
  }

  await audit({
    actorId: null, actorType: "SYSTEM", action: "update",
    entityType: "Resource", entityId: id,
    before: { name: studio.name, unitIds: prevIds },
    after: { name: name ?? studio.name, unitIds },
    note: name && name !== studio.name ? "Studio renamed and unit assignment updated" : "Studio unit assignment updated",
  });

  return NextResponse.json({ id, unitIds });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { id } = await params;
  const studio = await prisma.resource.findUnique({
    where: { id, deletedAt: null },
    include: { spaces: { select: { externalId: true } } },
  });
  if (!studio) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deletedAt = new Date();
  // Unlink all spaces, then soft-delete the resource
  await prisma.space.updateMany({ where: { resourceId: id }, data: { resourceId: null } });
  await prisma.resource.update({ where: { id }, data: { deletedAt } });

  await audit({
    actorId: null, actorType: "SYSTEM", action: "delete",
    entityType: "Resource", entityId: id,
    before: { name: studio.name, unitIds: studio.spaces.map(s => s.externalId) },
    after: { deletedAt },
    note: "Studio deleted — spaces unlinked",
  });

  return NextResponse.json({ ok: true });
}
