import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseSpacesFromSvg } from "@/lib/parseSpacesFromSvg";
import { computeFloorPlanDiff } from "@/lib/computeFloorPlanDiff";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
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

export interface PreviewDiff {
  newSpaces:          string[];
  removedUnassigned:  string[];
  removedAssigned:    string[];  // non-empty = blocked
  existingKept:       number;
}

export interface PreviewMeta {
  previewToken:    string;
  intent:          "new" | "revision";
  floorPlanId:     string | null;
  building:        string;
  floor:           number;
  dxfPath:         string;
  svgTmpPath:      string;
  diff:            PreviewDiff;
  skipMarkerCheck: boolean;
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const intent          = formData.get("intent") as "new" | "revision" | null;
  const file            = formData.get("dxf") as File | null;
  const floorPlanId     = (formData.get("floorPlanId") as string | null)?.trim() || null;
  const building        = (formData.get("building") as string | null)?.toUpperCase().trim() || null;
  const floorRaw        = formData.get("floor") as string | null;
  const floor           = floorRaw ? parseInt(floorRaw, 10) : NaN;
  const skipMarkerCheck = formData.get("skipMarkerCheck") === "true";

  if (!intent || !file) {
    return NextResponse.json({ error: "intent and dxf file are required" }, { status: 400 });
  }
  if (intent === "revision" && !floorPlanId) {
    return NextResponse.json({ error: "floorPlanId required for revision" }, { status: 400 });
  }
  if (intent === "new" && (!building || isNaN(floor))) {
    return NextResponse.json({ error: "building and floor required for new floor plan" }, { status: 400 });
  }

  // Resolve building/floor
  let resolvedBuilding = building ?? "";
  let resolvedFloor    = floor;
  let existingFp: { id: string; building: string; floor: number; svgPath: string } | null = null;

  if (intent === "revision") {
    existingFp = await prisma.floorPlan.findUnique({ where: { id: floorPlanId! } });
    if (!existingFp) {
      return NextResponse.json({ error: "Floor plan not found" }, { status: 404 });
    }
    resolvedBuilding = existingFp.building;
    resolvedFloor    = existingFp.floor;
  }

  // Save DXF to temp dir
  const token   = randomUUID();
  const tmpDir  = path.join(os.tmpdir(), `makerspace-preview-${token}`);
  await fs.mkdir(tmpDir, { recursive: true });
  const dxfPath = path.join(tmpDir, "input.dxf");
  await fs.writeFile(dxfPath, Buffer.from(await file.arrayBuffer()));

  const scriptPath = path.join(process.cwd(), "tools", "dxf_to_svg.py");

  // For revision: validate provenance marker (unless bootstrap bypass is set)
  if (intent === "revision" && !skipMarkerCheck) {
    let markerOutput: string;
    try {
      const { stdout } = await runScript([scriptPath, "--read-marker", "--input", dxfPath]);
      markerOutput = stdout.trim();
    } catch (err) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      return NextResponse.json({ error: `Could not read DXF: ${err}` }, { status: 422 });
    }

    if (markerOutput === "NONE") {
      await fs.rm(tmpDir, { recursive: true, force: true });
      return NextResponse.json({
        error: "This DXF has no provenance marker. Download the current labeled DXF from the app and use that as your starting point.",
      }, { status: 422 });
    }

    // Fetch current revision to validate marker
    const currentRevision = await prisma.floorPlanRevision.findFirst({
      where: { floorPlanId: floorPlanId! },
      orderBy: { uploadedAt: "desc" },
    });

    const expectedMarker = currentRevision
      ? `${floorPlanId}.${currentRevision.id}`
      : null;

    if (expectedMarker && markerOutput !== expectedMarker) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      return NextResponse.json({
        error: `DXF marker mismatch. Expected ${expectedMarker}, got ${markerOutput}. Download the current labeled DXF and start from that.`,
      }, { status: 422 });
    }
  }

  // Build config JSON from SpaceTypeConfig DB records and write to tmp
  const spaceTypes = await prisma.spaceTypeConfig.findMany({
    where: { active: true, dxfProcessingMode: { not: null } },
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
  });
  const configPayload = spaceTypes.map(t => ({
    slug:             t.slug,
    mode:             t.dxfProcessingMode,
    dxfLayer:         t.dxfLayer,
    dxfLabelLayer:    t.dxfLabelLayer,
    dxfBlockPattern:  t.dxfBlockPattern,
    color:            t.color,
  }));
  const configArgs: string[] = [];
  if (configPayload.length > 0) {
    const configPath = path.join(tmpDir, "space_types.json");
    await fs.writeFile(configPath, JSON.stringify(configPayload, null, 2));
    configArgs.push("--config", configPath);
  }

  // Run Python to generate SVG
  const svgTmpPath = path.join(tmpDir, "output.svg");
  try {
    await runScript([scriptPath, "--input", dxfPath, "--output", svgTmpPath, ...configArgs]);
  } catch (err) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    return NextResponse.json({ error: `SVG generation failed: ${err}` }, { status: 422 });
  }

  // Extract space IDs from generated SVG
  const svgText      = await fs.readFile(svgTmpPath, "utf-8");
  const incomingSpaces = parseSpacesFromSvg(svgText);

  // Compute diff against existing DB spaces (revision only)
  let diff: PreviewDiff;
  if (intent === "revision") {
    const dbSpaces = await prisma.space.findMany({
      where: { floorPlanId: floorPlanId! },
      select: { externalId: true, resourceId: true },
    });
    diff = computeFloorPlanDiff(incomingSpaces, dbSpaces);
  } else {
    // New floor plan — everything is new
    diff = {
      newSpaces:         Array.from(incomingSpaces.keys()),
      removedUnassigned: [],
      removedAssigned:   [],
      existingKept:      0,
    };
  }

  const blocked = diff.removedAssigned.length > 0;

  // Persist meta for commit step
  const meta: PreviewMeta = {
    previewToken: token,
    intent,
    floorPlanId,
    building:        resolvedBuilding,
    floor:           resolvedFloor,
    dxfPath,
    svgTmpPath,
    diff,
    skipMarkerCheck,
  };
  await fs.writeFile(path.join(tmpDir, "meta.json"), JSON.stringify(meta, null, 2));

  return NextResponse.json({
    previewToken: token,
    intent,
    building: resolvedBuilding,
    floor:    resolvedFloor,
    svgContent: svgText,
    diff,
    blocked,
  });
}
