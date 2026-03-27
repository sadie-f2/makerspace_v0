import { prisma } from "@/lib/prisma";

export async function GET() {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      { ok: true, db: "ok", latency_ms: Date.now() - t0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("Health check DB error:", err);
    return Response.json(
      { ok: false, db: "error", latency_ms: Date.now() - t0 },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
