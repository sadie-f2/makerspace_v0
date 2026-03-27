import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { syncFloorPlan } from "@/lib/syncFloorPlan";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";

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
  const formData = await req.formData();
  const file = formData.get("dxf") as File | null;
  const building = (formData.get("building") as string | null)?.toUpperCase().trim();
  const floor = parseInt(formData.get("floor") as string ?? "", 10);

  if (!file || !building || isNaN(floor)) {
    return NextResponse.json({ error: "building, floor, and dxf file are required" }, { status: 400 });
  }

  // Save DXF to a temp file
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "makerspace-dxf-"));
  const dxfPath = path.join(tmpDir, `${building}_${floor}.dxf`);
  const bytes = await file.arrayBuffer();
  await fs.writeFile(dxfPath, Buffer.from(bytes));

  // Output SVG path
  const svgFilename = `${building.toLowerCase()}_${floor}.svg`;
  const svgPublicPath = `/floorplans/${svgFilename}`;
  const svgAbsPath = path.join(process.cwd(), "public", "floorplans", svgFilename);
  await fs.mkdir(path.join(process.cwd(), "public", "floorplans"), { recursive: true });

  // Locate the script
  const scriptPath = path.join(process.cwd(), "tools", "dxf_to_svg.py");

  let stdout = "";
  let stderr = "";
  try {
    ({ stdout, stderr } = await runScript([scriptPath, "--input", dxfPath, "--output", svgAbsPath]));
  } catch (err) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    return NextResponse.json({ error: String(err), stderr }, { status: 422 });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  // Timestamp-stamp the SVG filename so each revision has a distinct file on disk
  const ts = Date.now();
  const svgFilenameVersioned = `${building.toLowerCase()}_${floor}_${ts}.svg`;
  const svgPublicPathVersioned = `/floorplans/${svgFilenameVersioned}`;
  const svgAbsPathVersioned = path.join(process.cwd(), "public", "floorplans", svgFilenameVersioned);
  await fs.rename(svgAbsPath, svgAbsPathVersioned);

  // Register / update FloorPlan record (svgPath always = current)
  const fp = await prisma.floorPlan.upsert({
    where: { building_floor: { building, floor } },
    update: { svgPath: svgPublicPathVersioned },
    create: { building, floor, svgPath: svgPublicPathVersioned },
  });

  // Create a revision record
  await prisma.floorPlanRevision.create({
    data: {
      floorPlanId:  fp.id,
      svgPath:      svgPublicPathVersioned,
      note:         `Uploaded: ${file.name}`,
    },
  });

  await audit({
    actorId: null,
    actorType: "SYSTEM",
    action: "create",
    entityType: "FloorPlan",
    entityId: fp.id,
    after: { building, floor, svgPath: svgPublicPathVersioned },
    note: `DXF upload: ${file.name}`,
  });

  // Auto-sync spaces from the newly generated SVG
  const syncResult = await syncFloorPlan(fp.id);

  return NextResponse.json({ id: fp.id, svgPath: svgPublicPathVersioned, stdout, stderr, sync: syncResult });
}
