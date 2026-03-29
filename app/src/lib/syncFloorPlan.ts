import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { parseSpacesFromSvg } from "@/lib/parseSpacesFromSvg";
import { readFile } from "fs/promises";
import path from "path";

export interface SyncResult {
  created: number;
  existing: number;
  total: number;
}

/**
 * Parse the SVG on disk for a floor plan and upsert Space records.
 * Safe to call multiple times — existing spaces are left untouched.
 */
export async function syncFloorPlan(floorPlanId: string): Promise<SyncResult> {
  const fp = await prisma.floorPlan.findUniqueOrThrow({ where: { id: floorPlanId } });

  const svgFile = path.join(process.cwd(), "public", fp.svgPath);
  const svgText = await readFile(svgFile, "utf-8");
  const found   = parseSpacesFromSvg(svgText);

  const results: SyncResult = { created: 0, existing: 0, total: found.size };

  for (const space of found.values()) {
    const existing = await prisma.space.findUnique({ where: { externalId: space.externalId } });
    if (existing) {
      results.existing++;
      continue;
    }
    const name = space.externalId
      .replace(/_/g, " ")
      .replace(/:/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    await prisma.space.create({
      data: {
        externalId:  space.externalId,
        name,
        blockType:   space.blockType,
        floorPlanId,
        bayCode:     space.bayCode,
        shelfLevel:  space.shelfLevel,
      },
    });
    results.created++;
  }

  await audit({
    actorId:    null,
    actorType:  "SYSTEM",
    action:     "create",
    entityType: "FloorPlan.sync",
    entityId:   floorPlanId,
    after:      { svgPath: fp.svgPath, ...results },
    note:       `Sync: ${results.created} new, ${results.existing} existing, ${found.size} total`,
  });

  return results;
}
