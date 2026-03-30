import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/requireStaff";
import { requireUnfrozen } from "@/lib/freeze";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function StudioSettingsPage() {
  await requireStaff();
  const sizes = await prisma.studioSize.findMany({ orderBy: { unitCount: "asc" } });

  async function addSize(formData: FormData) {
    "use server";
    await requireUnfrozen("/admin/settings/studios");
    const raw = formData.get("unitCount") as string;
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 1) return;
    await prisma.studioSize.upsert({
      where: { unitCount: n },
      update: { active: true },
      create: { unitCount: n, sortOrder: n },
    });
    revalidatePath("/admin/settings/studios");
    revalidatePath("/admin/studios", "layout");
  }

  async function toggleSize(formData: FormData) {
    "use server";
    await requireUnfrozen("/admin/settings/studios");
    const id = formData.get("id") as string;
    const current = await prisma.studioSize.findUnique({ where: { id } });
    if (!current) return;
    await prisma.studioSize.update({ where: { id }, data: { active: !current.active } });
    revalidatePath("/admin/settings/studios");
    revalidatePath("/admin/studios", "layout");
  }

  return (
    <div className="max-w-sm space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-1">Allowed studio sizes</h3>
        <p className="text-xs text-gray-500 mb-4">
          Number of 50 sf units that may be assembled into a studio. Inactive sizes cannot be used for new studios but existing studios are unaffected.
        </p>
        <div className="rounded-md border divide-y mb-4">
          {sizes.map(s => (
            <div key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className={s.active ? "" : "text-gray-400 line-through"}>
                {s.unitCount} unit{s.unitCount !== 1 ? "s" : ""}
                <span className="ml-2 text-xs text-gray-400">({s.unitCount * 50} sf)</span>
              </span>
              <form action={toggleSize}>
                <input type="hidden" name="id" value={s.id} />
                <button type="submit" className="text-xs text-gray-400 hover:text-gray-700">
                  {s.active ? "Disable" : "Enable"}
                </button>
              </form>
            </div>
          ))}
          {sizes.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-400">No sizes configured.</p>
          )}
        </div>
        <form action={addSize} className="flex gap-2">
          <Input
            name="unitCount"
            type="number"
            min={1}
            placeholder="Unit count"
            className="h-8 text-sm w-32"
          />
          <Button type="submit" size="sm" variant="outline">Add size</Button>
        </form>
      </div>
    </div>
  );
}
