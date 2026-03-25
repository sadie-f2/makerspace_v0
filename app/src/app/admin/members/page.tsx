import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: raw } = await searchParams;
  const q = raw?.trim() ?? "";

  const members = await prisma.member.findMany({
    where: {
      deletedAt: null,
      ...(q ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      } : {}),
    },
    include: { tier: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Members</h2>
        <Link href="/admin/members/new">
          <Button size="sm">+ New member</Button>
        </Link>
      </div>

      <form className="mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name or email…"
          className="border rounded px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-gray-400 py-8">
                No members found.
              </TableCell>
            </TableRow>
          )}
          {members.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <Link href={`/admin/members/${m.id}`} className="font-medium hover:underline">
                  {m.name}
                </Link>
              </TableCell>
              <TableCell className="text-gray-600">{m.email}</TableCell>
              <TableCell>{m.tier?.name ?? <span className="text-gray-400">—</span>}</TableCell>
              <TableCell>
                {m.role !== "MEMBER" && (
                  <Badge variant={m.role === "ADMIN" ? "default" : "secondary"}>
                    {m.role}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-gray-500 text-sm">
                {m.createdAt.toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
