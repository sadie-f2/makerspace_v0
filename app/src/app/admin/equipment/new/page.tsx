import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NewEquipmentClassPage() {
  async function createClass(formData: FormData) {
    "use server";
    const name = formData.get("name") as string;
    const description = (formData.get("description") as string) || null;
    const ec = await prisma.equipmentClass.create({ data: { name, description } });
    redirect(`/admin/equipment/${ec.id}`);
  }

  return (
    <div className="max-w-md">
      <div className="mb-4">
        <Link href="/admin/equipment" className="text-sm text-gray-500 hover:underline">
          ← Equipment
        </Link>
      </div>
      <h2 className="text-lg font-semibold mb-6">New Equipment Class</h2>
      <form action={createClass} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="name">Class name</Label>
          <Input id="name" name="name" placeholder="e.g. Laser" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="description">Description (optional)</Label>
          <Input id="description" name="description" placeholder="e.g. Laser cutters and engravers" />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit">Create</Button>
          <Link href="/admin/equipment">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
