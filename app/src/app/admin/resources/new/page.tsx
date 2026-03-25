import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
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

export default async function NewResourcePage() {
  const [parents, equipmentClasses] = await Promise.all([
    prisma.resource.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, typeTag: true },
      orderBy: { name: "asc" },
    }),
    prisma.equipmentClass.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  async function createResource(formData: FormData) {
    "use server";
    const name = formData.get("name") as string;
    const description = (formData.get("description") as string) || null;
    const typeTag = formData.get("typeTag") as string;
    const parentId = (formData.get("parentId") as string) || null;
    const reservable = formData.get("reservable") === "on";
    const leasable = formData.get("leasable") === "on";
    const reservationMode = (formData.get("reservationMode") as string) || "NONE";
    const requiresCertClassId = (formData.get("requiresCertClassId") as string) || null;

    const r = await prisma.resource.create({
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
    redirect(`/admin/resources/${r.id}`);
  }

  return (
    <div className="max-w-lg">
      <div className="mb-4">
        <Link href="/admin/resources" className="text-sm text-gray-500 hover:underline">
          ← Resources
        </Link>
      </div>
      <h2 className="text-lg font-semibold mb-6">New Resource</h2>

      <form action={createResource} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="e.g. Epilog Laser" required />
        </div>

        <div className="space-y-1">
          <Label htmlFor="description">Description (optional)</Label>
          <Input id="description" name="description" placeholder="Short description" />
        </div>

        <div className="space-y-1">
          <Label htmlFor="typeTag">Type</Label>
          <select
            id="typeTag"
            name="typeTag"
            required
            className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            {TYPE_TAGS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="parentId">Parent (optional)</Label>
          <select
            id="parentId"
            name="parentId"
            className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">— No parent (top-level) —</option>
            {parents.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.typeTag})</option>
            ))}
          </select>
        </div>

        <fieldset className="border rounded p-3 space-y-2">
          <legend className="text-xs font-medium text-gray-500 uppercase tracking-wide px-1">Booking flags</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="reservable" />
            Reservable (time-bounded bookings)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="leasable" />
            Leasable (ongoing lease)
          </label>
          <div className="space-y-1 pt-1">
            <Label htmlFor="reservationMode" className="text-xs">Reservation mode</Label>
            <select
              id="reservationMode"
              name="reservationMode"
              className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
            >
              <option value="NONE">None</option>
              <option value="ADVISORY">Advisory (calendar only)</option>
              <option value="EXCLUSIVE">Exclusive (blocks double-booking)</option>
            </select>
          </div>
        </fieldset>

        <div className="space-y-1">
          <Label htmlFor="requiresCertClassId">Certification required (optional)</Label>
          <select
            id="requiresCertClassId"
            name="requiresCertClassId"
            className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">— None —</option>
            {equipmentClasses.map(ec => (
              <option key={ec.id} value={ec.id}>{ec.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit">Create</Button>
          <Link href="/admin/resources">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
