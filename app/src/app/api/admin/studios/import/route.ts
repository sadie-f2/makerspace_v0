import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

interface ImportRow {
  studioName: string;
  unitIds: string[];
  assigneeEmail: string;
  monthlyRate: string;
  errors: string[];
}

export async function POST(req: Request) {
  const { rows }: { rows: ImportRow[] } = await req.json();
  const validRows = rows.filter(r => r.errors.length === 0 && r.studioName && r.unitIds.length > 0);

  let created = 0;
  let assigned = 0;

  for (const row of validRows) {
    // Create Resource of type studio_unit
    const resource = await prisma.resource.create({
      data: {
        name: row.studioName,
        typeTag: "studio_unit",
        leasable: true,
      },
    });

    // Link matching Space records
    await prisma.space.updateMany({
      where: { externalId: { in: row.unitIds } },
      data: { resourceId: resource.id },
    });

    await audit({
      actorId: null,
      actorType: "SYSTEM",
      action: "create",
      entityType: "Resource",
      entityId: resource.id,
      after: { name: row.studioName, typeTag: "studio_unit", unitIds: row.unitIds },
      note: "Studio import",
    });

    created++;

    // Create rental if assignee provided
    if (row.assigneeEmail) {
      const member = await prisma.member.findFirst({
        where: { email: row.assigneeEmail, deletedAt: null },
      });
      if (member) {
        const monthlyRate = parseFloat(row.monthlyRate) || 0;
        const rental = await prisma.rental.create({
          data: {
            resourceId: resource.id,
            memberId: member.id,
            startDate: new Date(),
            monthlyRate,
          },
        });
        await audit({
          actorId: null,
          actorType: "SYSTEM",
          action: "create",
          entityType: "Rental",
          entityId: rental.id,
          after: { resourceId: resource.id, memberId: member.id, monthlyRate },
          note: "Studio import assignment",
        });
        assigned++;
      }
    }
  }

  return NextResponse.json({ created, assigned });
}
