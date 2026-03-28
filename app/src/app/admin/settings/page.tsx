import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { audit } from "@/lib/audit";
import { invalidateFreezeCache } from "@/lib/freeze";
import { Button } from "@/components/ui/button";

export default async function SettingsGeneralPage({
  searchParams,
}: {
  searchParams: Promise<{ frozen?: string }>;
}) {
  const session = await auth();
  const { frozen } = await searchParams;

  const config = await prisma.systemConfig.findFirst();
  const isFrozen = config?.systemFreeze ?? false;

  const isAdmin = session?.user.role === "ADMIN";

  async function toggleFreeze(formData: FormData) {
    "use server";
    const session = await auth();
    if (session?.user.role !== "ADMIN") return;

    const action    = formData.get("action") as string; // "freeze" | "unfreeze"
    const newState  = action === "freeze";
    const reason    = (formData.get("reason") as string ?? "").trim() || undefined;

    if (!config) {
      await prisma.systemConfig.create({ data: { systemFreeze: newState, updatedById: session.user.id } });
    } else {
      await prisma.systemConfig.update({
        where: { id: config.id },
        data:  { systemFreeze: newState, updatedById: session.user.id },
      });
    }

    invalidateFreezeCache();

    await audit({
      actorId:    session.user.id,
      actorType:  "ADMIN",
      action:     "update",
      entityType: "SystemConfig",
      entityId:   config?.id ?? "system",
      before:     { systemFreeze: !newState },
      after:      { systemFreeze: newState },
      note:       newState
        ? `System frozen${reason ? `: ${reason}` : ""}`
        : `System unfrozen${reason ? `: ${reason}` : ""}`,
    });

    redirect("/admin/settings");
  }

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-1">General Settings</h2>
        <p className="text-sm text-gray-500">System-wide configuration.</p>
      </div>

      {/* ── Write Freeze ── */}
      <section className="border rounded p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-medium text-sm">Write Freeze</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Halts all write operations platform-wide. Read operations continue normally.
              Use when a data problem needs assessment before further mutations can proceed.
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ml-4 shrink-0 ${
            isFrozen ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
          }`}>
            {isFrozen ? "FROZEN" : "Active"}
          </span>
        </div>

        {frozen === "1" && (
          <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
            Write operation blocked — system is currently frozen.
          </div>
        )}

        {!isAdmin ? (
          <p className="text-xs text-gray-400 italic">Only admin users can toggle the write freeze.</p>
        ) : isFrozen ? (
          <form action={toggleFreeze} className="space-y-2">
            <input type="hidden" name="action" value="unfreeze" />
            <div className="flex gap-2 items-center">
              <input
                name="reason"
                type="text"
                placeholder="Reason for unfreezing (optional)"
                className="border rounded px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
              <Button type="submit" size="sm">Unfreeze system</Button>
            </div>
          </form>
        ) : (
          <form action={toggleFreeze} className="space-y-2">
            <input type="hidden" name="action" value="freeze" />
            <p className="text-xs text-gray-500">
              Confirm the reason before freezing. All admin write operations will return an error until unfrozen.
            </p>
            <div className="flex gap-2 items-center">
              <input
                name="reason"
                type="text"
                placeholder="Reason (e.g. investigating cascade on member import)"
                className="border rounded px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-gray-400"
                required
              />
              <Button type="submit" size="sm" variant="destructive">Freeze writes</Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
