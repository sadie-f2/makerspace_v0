import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

interface ImportItem {
  spaceExternalId: string;
  name: string;
  typeTag: string;
}

export async function POST(req: Request) {
  const { items } = await req.json() as { items: ImportItem[] };
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items array required" }, { status: 400 });
  }

  let created = 0;
  for (const item of items) {
    if (!item.spaceExternalId || !item.name || !item.typeTag) continue;

    const space = await prisma.space.findUnique({
      where: { externalId: item.spaceExternalId },
    });
    if (!space || space.resourceId) continue; // already linked

    const resource = await prisma.resource.create({
      data: {
        name:     item.name,
        typeTag:  item.typeTag,
        leasable: true,
      },
    });
    await prisma.space.update({
      where: { id: space.id },
      data:  { resourceId: resource.id },
    });
    await audit({
      actorId:    null,
      actorType:  "SYSTEM",
      action:     "create",
      entityType: "Resource",
      entityId:   resource.id,
      after:      { name: resource.name, typeTag: resource.typeTag, spaceExternalId: item.spaceExternalId },
      note:       "Created from storage import panel",
    });
    created++;
  }

  return NextResponse.json({ created });
}
