import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TYPE_TAGS = [
  "org",
  "shop",
  "tool",
  "meeting_room",
  "studio_unit",
  "storage_unit",
  "common_area",
];

export default async function ResourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [resource, allResources, equipmentClasses] = await Promise.all([
    prisma.resource.findUnique({
      where: { id, deletedAt: null },
      include: {
        parent: { select: { id: true, name: true } },
        children: {
          where: { deletedAt: null },
          select: { id: true, name: true, typeTag: true },
          orderBy: { name: "asc" },
        },
        requiresCertClass: { select: { id: true, name: true } },
      },
    }),
    prisma.resource.findMany({
      where: { deletedAt: null, id: { not: id } },
      select: { id: true, name: true, typeTag: true },
      orderBy: { name: "asc" },
    }),
    prisma.equipmentClass.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!resource) notFound();

  async function updateResource(formData: FormData) {
    "use server";
    const name = formData.get("name") as string;
    const description = (formData.get("description") as string) || null;
    const typeTag = formData.get("typeTag") as string;
    const parentId = (formData.get("parentId") as string) || null;
    const reservable = formData.get("reservable") === "on";
    const leasable = formData.get("leasable") === "on";
    const reservationMode = (formData.get("reservationMode") as string) || "NONE";
    const requiresCertClassId = (formData.get("requiresCertClassId") as string) || null;

    await prisma.resource.update({
      where: { id },
      data: {
        name,
        description,
        typeTag,
        parentId,
        reservable,
        leasable,
        reservationMode: reservationMode as "EXCLUSIVE" | "ADVISORY" | "NONE",
        requiresCertClassId,
      },
    });
    redirect(`/admin/resources/${id}`);
  }

  async function deleteResource(formData: FormData) {
    "use server";
    void formData;
    await prisma.resource.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    redirect("/admin/resources");
  }

  return (
    <div className="max-w-lg">
      <div className="mb-4">
        <Link href="/admin/resources" className="text-sm text-gray-500 hover:underline">
          ← Resources
        </Link>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">{resource.name}</h2>
          {resource.parent && (
            <p className="text-sm text-gray-500">
              in{" "}
              <Link href={`/admin/resources/${resource.parent.id}`} className="hover:underline">
                {resource.parent.name}
              </Link>
            </p>
          )}
        </div>
        <Badge variant="outline">{resource.typeTag}</Badge>
      </div>

      {resource.children.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Children</p>
          <div className="flex flex-wrap gap-2">
            {resource.children.map(c => (
              <Link key={c.id} href={`/admin/resources/${c.id}`}>
                <Badge variant="secondary" className="hover:bg-gray-200 cursor-pointer">
                  {c.name}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      <form action={updateResource} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={resource.name} required />
        </div>

        <div className="space-y-1">
          <Label htmlFor="description">Description (optional)</Label>
          <Input id="description" name="description" defaultValue={resource.description ?? ""} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="typeTag">Type</Label>
          <select
            id="typeTag"
            name="typeTag"
            defaultValue={resource.typeTag}
            className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            {TYPE_TAGS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="parentId">Parent</Label>
          <select
            id="parentId"
            name="parentId"
            defaultValue={resource.parentId ?? ""}
            className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">— No parent (top-level) —</option>
            {allResources.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.typeTag})</option>
            ))}
          </select>
        </div>

        <fieldset className="border rounded p-3 space-y-2">
          <legend className="text-xs font-medium text-gray-500 uppercase tracking-wide px-1">Booking flags</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="reservable" defaultChecked={resource.reservable} />
            Reservable
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="leasable" defaultChecked={resource.leasable} />
            Leasable
          </label>
          <div className="space-y-1 pt-1">
            <Label htmlFor="reservationMode" className="text-xs">Reservation mode</Label>
            <select
              id="reservationMode"
              name="reservationMode"
              defaultValue={resource.reservationMode}
              className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
            >
              <option value="NONE">None</option>
              <option value="ADVISORY">Advisory</option>
              <option value="EXCLUSIVE">Exclusive</option>
            </select>
          </div>
        </fieldset>

        <div className="space-y-1">
          <Label htmlFor="requiresCertClassId">Certification required</Label>
          <select
            id="requiresCertClassId"
            name="requiresCertClassId"
            defaultValue={resource.requiresCertClassId ?? ""}
            className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">— None —</option>
            {equipmentClasses.map(ec => (
              <option key={ec.id} value={ec.id}>{ec.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit">Save changes</Button>
          <Link href="/admin/resources">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
        </div>
      </form>

      {resource.children.length === 0 && (
        <div className="mt-8 pt-6 border-t">
          <p className="text-xs text-gray-500 mb-3">Danger zone — this cannot be undone.</p>
          <form action={deleteResource}>
            <Button type="submit" variant="destructive" size="sm">
              Delete resource
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
