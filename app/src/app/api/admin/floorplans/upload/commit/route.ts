import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { syncFloorPlan } from "@/lib/syncFloorPlan";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";
import type { PreviewMeta } from "@/app/api/admin/floorplans/upload/preview/route";

function runScript(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || `exit code ${code}`));
    });
  });
}

export async function POST(req: Request) {
  const { previewToken } = await req.json() as { previewToken: string };
  if (!previewToken) {
    return NextResponse.json({ error: "previewToken required" }, { status: 400 });
  }

  const tmpDir  = path.join(os.tmpdir(), `makerspace-preview-${previewToken}`);
  const metaPath = path.join(tmpDir, "meta.json");

  let meta: PreviewMeta;
  try {
    meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
  } catch {
    return NextResponse.json({ error: "Preview session not found or expired" }, { status: 404 });
  }

  // Double-check no assigned spaces are being removed (guard against race)
  if (meta.diff.removedAssigned.length > 0) {
    return NextResponse.json({
      error: `Cannot commit: assigned spaces would be removed: ${meta.diff.removedAssigned.join(", ")}`,
    }, { status: 422 });
  }

  // Create or fetch FloorPlan record
  let fp: { id: string; building: string; floor: number; svgPath: string };
  if (meta.intent === "new") {
    fp = await prisma.floorPlan.upsert({
      where:  { building_floor: { building: meta.building, floor: meta.floor } },
      update: {},
      create: { building: meta.building, floor: meta.floor, svgPath: "" },
    });
  } else {
    fp = (await prisma.floorPlan.findUniqueOrThrow({ where: { id: meta.floorPlanId! } }));
  }

  // Create revision record first to get the ID
  const revNote = meta.intent === "new"
    ? "Initial upload"
    : meta.skipMarkerCheck
      ? "Revision upload (marker check bypassed — bootstrap)"
      : "Revision upload";
  const revision = await prisma.floorPlanRevision.create({
    data: {
      floorPlanId: fp.id,
      svgPath:     "",  // filled in below
      note:        revNote,
    },
  });

  // Build final SVG filename and path
  const svgFilename = `${meta.building.toLowerCase()}_${meta.floor}_${revision.id}.svg`;
  const svgPublicPath = `/floorplans/${svgFilename}`;
  const svgAbsPath = path.join(process.cwd(), "public", "floorplans", svgFilename);
  await fs.mkdir(path.join(process.cwd(), "public", "floorplans"), { recursive: true });

  // Move temp SVG to final location
  await fs.copyFile(meta.svgTmpPath, svgAbsPath);

  // Generate labeled DXF with provenance marker
  const marker = `${fp.id}.${revision.id}`;
  const scriptPath = path.join(process.cwd(), "tools", "dxf_to_svg.py");
  const labeledDxfTmp = path.join(os.tmpdir(), `labeled-${revision.id}.dxf`);

  // Build config from DB (same logic as preview route)
  const spaceTypes = await prisma.spaceTypeConfig.findMany({
    where: { active: true, dxfProcessingMode: { not: null } },
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
  });
  const configArgs: string[] = [];
  if (spaceTypes.length > 0) {
    const configPayload = spaceTypes.map(t => ({
      slug:            t.slug,
      mode:            t.dxfProcessingMode,
      dxfLayer:        t.dxfLayer,
      dxfLabelLayer:   t.dxfLabelLayer,
      dxfBlockPattern: t.dxfBlockPattern,
      color:           t.color,
    }));
    const configPath = path.join(os.tmpdir(), `space-types-${revision.id}.json`);
    await fs.writeFile(configPath, JSON.stringify(configPayload, null, 2));
    configArgs.push("--config", configPath);
  }

  try {
    await runScript([
      scriptPath,
      "--input",      meta.dxfPath,
      "--output",     svgAbsPath,   // regenerate in-place (idempotent)
      "--output-dxf", labeledDxfTmp,
      "--marker",     marker,
      ...configArgs,
    ]);
  } catch (err) {
    // Clean up revision and SVG, re-throw
    await prisma.floorPlanRevision.delete({ where: { id: revision.id } });
    await fs.rm(svgAbsPath, { force: true });
    await fs.rm(tmpDir, { recursive: true, force: true });
    return NextResponse.json({ error: `Labeled DXF generation failed: ${err}` }, { status: 422 });
  }

  // Read labeled DXF bytes
  const dxfBytes = await fs.readFile(labeledDxfTmp);

  // Save convenience copy to private/floorplans/BUILDING_FLOOR#.REVISIONID.dxf
  const privateDxfDir = path.join(process.cwd(), "private", "floorplans");
  await fs.mkdir(privateDxfDir, { recursive: true });
  const privateDxfPath = path.join(privateDxfDir, `${meta.building}_${meta.floor}.${revision.id}.dxf`);
  await fs.writeFile(privateDxfPath, dxfBytes);

  // Update revision with SVG path and DXF bytes
  await prisma.floorPlanRevision.update({
    where: { id: revision.id },
    data:  { svgPath: svgPublicPath, dxfData: dxfBytes },
  });

  // Update FloorPlan.svgPath to current revision
  await prisma.floorPlan.update({
    where: { id: fp.id },
    data:  { svgPath: svgPublicPath },
  });

  // Auto-sync spaces
  const syncResult = await syncFloorPlan(fp.id);

  await audit({
    actorId:    null,
    actorType:  "SYSTEM",
    action:     meta.intent === "new" ? "create" : "update",
    entityType: "FloorPlan",
    entityId:   fp.id,
    after:      { building: meta.building, floor: meta.floor, svgPath: svgPublicPath, marker, sync: syncResult },
    note:       `${meta.intent === "new" ? "New" : "Revision"} upload committed`,
  });

  // Clean up temp files
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(labeledDxfTmp, { force: true });

  revalidatePath("/admin/studios");

  return NextResponse.json({
    floorPlanId: fp.id,
    revisionId:  revision.id,
    svgPath:     svgPublicPath,
    marker,
    sync:        syncResult,
  });
}
