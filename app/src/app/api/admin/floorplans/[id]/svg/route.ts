import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";
import { requireAdminApi } from "@/lib/requireAdminApi";

const FILL = {
  vacant:   "#bbf7d0",
  occupied: "#bfdbfe",
  shop:     "#dbeafe",
  storage:  "#fde8d8",
  common:   "#f5f5f5",
  unlinked: "#e5e7eb",
} as const;

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminApi();
  if (denied) return denied;
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
    },
  });

  if (!fp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Read SVG from disk
  const svgAbsPath = path.join(process.cwd(), "public", fp.svgPath);
  let svg: string;
  try {
    svg = await readFile(svgAbsPath, "utf-8");
  } catch {
    return NextResponse.json({ error: "SVG file not found on disk" }, { status: 404 });
  }

  // Step 1: inject tooltip data attributes alongside each data-space-id (must happen BEFORE style block)
  const spaceMap = new Map(fp.spaces.map(s => [s.externalId, s]));
  svg = svg.replace(/data-space-id="([^"]+)"/g, (_match, externalId: string) => {
    const space = spaceMap.get(externalId);
    const base = `data-space-id="${externalId}"`;
    if (!space) return base;

    const extras: string[] = [];
    if (space.resourceId)       extras.push(`data-resource-id="${space.resourceId}"`);
    if (space.resource?.name)   extras.push(`data-resource-name="${escapeAttr(space.resource.name)}"`);
    const occupant = space.resource?.rentals[0]?.member.name;
    if (occupant)               extras.push(`data-occupant="${escapeAttr(occupant)}"`);

    return extras.length > 0 ? `${base} ${extras.join(" ")}` : base;
  });

  // Step 2: build per-space fill rules and inject <style> block
  const cssRules: string[] = [];
  for (const space of fp.spaces) {
    const type = space.blockType;
    let fill: string;
    if (type === "common_area")              fill = FILL.common;
    else if (type === "shop")                fill = FILL.shop;
    else if (!space.resourceId)              fill = FILL.unlinked;
    else if (space.resource?.rentals[0])      fill = FILL.occupied;
    else if (type === "storage_unit")        fill = FILL.storage;
    else                                     fill = FILL.vacant;

    cssRules.push(`[data-space-id="${space.externalId}"] { fill: ${fill} !important; }`);
  }

  cssRules.push(".hovered { fill: #fef9c3 !important; }");
  const styleBlock = `<style>\n${cssRules.join("\n")}\n</style>`;
  svg = svg.replace("</svg>", `${styleBlock}\n</svg>`);

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, no-cache",
    },
  });
}
