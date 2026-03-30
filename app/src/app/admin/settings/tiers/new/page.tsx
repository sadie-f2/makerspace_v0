import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/requireStaff";
import { requireUnfrozen } from "@/lib/freeze";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PERMISSION_FIELDS = [
  { name: "canBook",        label: "Can book equipment",      defaultChecked: true  },
  { name: "canRentStudio",  label: "Can rent a studio",       defaultChecked: false },
  { name: "canRentStorage", label: "Can rent storage",        defaultChecked: true  },
  { name: "buildingAccess", label: "24/7 building fob access",defaultChecked: true  },
] as const;

export default async function NewTierPage() {
  await requireStaff();

  async function createTier(formData: FormData) {
    "use server";
    await requireUnfrozen("/admin/settings/tiers");
    const name       = (formData.get("name") as string).trim();
    const slug       = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/, "");
    const monthlyRate = parseFloat(formData.get("monthlyRate") as string);
    const sortOrder  = parseInt(formData.get("sortOrder") as string, 10) || 0;
    if (!name || isNaN(monthlyRate)) return;

    await prisma.memberTier.create({
      data: {
        name,
        slug,
        monthlyRate,
        sortOrder,
        canBook:        formData.get("canBook")        === "on",
        canRentStudio:  formData.get("canRentStudio")  === "on",
        canRentStorage: formData.get("canRentStorage") === "on",
        buildingAccess: formData.get("buildingAccess") === "on",
      },
    });
    revalidatePath("/admin/settings/tiers");
    revalidatePath("/admin/members", "layout");
    redirect("/admin/settings/tiers");
  }

  return (
    <div className="max-w-sm">
      <div className="mb-4">
        <Link href="/admin/settings/tiers" className="text-sm text-gray-500 hover:underline">
          ← Tiers
        </Link>
      </div>
      <h3 className="text-sm font-medium mb-4">New membership tier</h3>

      <form action={createTier} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required placeholder="Full Member" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="monthlyRate">Monthly rate ($)</Label>
          <Input id="monthlyRate" name="monthlyRate" type="number" min="0" step="0.01" required placeholder="0.00" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sortOrder">Sort order</Label>
          <Input id="sortOrder" name="sortOrder" type="number" defaultValue={0} className="w-24" />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Permissions</legend>
          {PERMISSION_FIELDS.map(({ name, label, defaultChecked }) => (
            <label key={name} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" name={name} defaultChecked={defaultChecked} />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="flex gap-3 pt-2">
          <Button type="submit">Create tier</Button>
          <Link href="/admin/settings/tiers">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
