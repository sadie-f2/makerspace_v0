import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export default async function EquipmentPage() {
  const classes = await prisma.equipmentClass.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { certifications: { where: { revokedAt: null } } } },
      resources: {
        where: { deletedAt: null },
        select: { id: true, name: true, typeTag: true },
        orderBy: { name: "asc" },
      },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Equipment Classes</h2>
        <Link href="/admin/equipment/new">
          <Button size="sm">+ New class</Button>
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Class</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Tools requiring cert</TableHead>
            <TableHead className="text-right">Certified members</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {classes.map((ec) => (
            <TableRow key={ec.id}>
              <TableCell>
                <Link href={`/admin/equipment/${ec.id}`} className="font-medium hover:underline">
                  {ec.name}
                </Link>
              </TableCell>
              <TableCell className="text-gray-500 text-sm">{ec.description ?? "—"}</TableCell>
              <TableCell className="text-sm text-gray-600">
                {ec.resources.length === 0
                  ? <span className="text-gray-400">None</span>
                  : ec.resources.map((r) => r.name).join(", ")}
              </TableCell>
              <TableCell className="text-right">{ec._count.certifications}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
