import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUnfrozen } from "@/lib/freeze";
import { Button } from "@/components/ui/button";

export default async function TierSettingsPage() {
  const tiers = await prisma.memberTier.findMany({ orderBy: { sortOrder: "asc" } });

  async function toggleActive(formData: FormData) {
    "use server";
    await requireUnfrozen("/admin/settings/tiers");
    const id = formData.get("id") as string;
    const current = await prisma.memberTier.findUnique({ where: { id } });
    if (!current) return;
    await prisma.memberTier.update({ where: { id }, data: { active: !current.active } });
    revalidatePath("/admin/settings/tiers");
    revalidatePath("/admin/members", "layout");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium mb-1">Membership tiers</h3>
          <p className="text-xs text-gray-500">
            Configurable list of membership levels with permissions and rates.
            Inactive tiers cannot be assigned to new members but existing assignments are unaffected.
          </p>
        </div>
        <Link href="/admin/settings/tiers/new">
          <Button size="sm" variant="outline">Add tier</Button>
        </Link>
      </div>

      <div className="rounded-md border divide-y">
        {tiers.map(t => (
          <div key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <span className={t.active ? "font-medium" : "font-medium text-gray-400 line-through"}>
                {t.name}
              </span>
              <span className="ml-2 text-gray-400 font-mono">${Number(t.monthlyRate).toFixed(0)}/mo</span>
              <div className="flex flex-wrap gap-x-3 mt-0.5 text-xs text-gray-400">
                {t.canBook         && <span>book equipment</span>}
                {t.canRentStudio   && <span>rent studio</span>}
                {t.canRentStorage  && <span>rent storage</span>}
                {t.buildingAccess  && <span>24/7 fob</span>}
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <Link
                href={`/admin/settings/tiers/${t.id}`}
                className="text-xs text-gray-400 hover:text-gray-700 hover:underline"
              >
                Edit
              </Link>
              <form action={toggleActive}>
                <input type="hidden" name="id" value={t.id} />
                <button type="submit" className="text-xs text-gray-400 hover:text-gray-700">
                  {t.active ? "Disable" : "Enable"}
                </button>
              </form>
            </div>
          </div>
        ))}
        {tiers.length === 0 && (
          <p className="px-4 py-3 text-xs text-gray-400">No tiers configured yet.</p>
        )}
      </div>
    </div>
  );
}
