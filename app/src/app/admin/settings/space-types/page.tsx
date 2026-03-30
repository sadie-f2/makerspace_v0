import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireStaff } from "@/lib/requireStaff";
import { audit } from "@/lib/audit";
import { requireUnfrozen } from "@/lib/freeze";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PROCESSING_MODES = [
  { value: "",                   label: "— None (not on floor plan) —" },
  { value: "insert_numbered",    label: "insert_numbered — INSERT blocks, sequential numbers (studios)" },
  { value: "insert_coded",       label: "insert_coded — INSERT blocks, bay codes (lockers, pallets, carts)" },
  { value: "insert_multilevel",  label: "insert_multilevel — INSERT blocks on layer+N, shelf levels" },
  { value: "polyline_labeled",   label: "polyline_labeled — closed LWPOLYLINE + label (shops, rooms)" },
];

export default async function SpaceTypesPage() {
  await requireStaff();
  const session = await auth();
  const actorId = session?.user.id ?? null;

  const types = await prisma.spaceTypeConfig.findMany({
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
  });

  const topLevel = types.filter(t => !t.parentId);
  const byParent: Record<string, typeof types> = {};
  for (const t of types.filter(t => t.parentId)) {
    (byParent[t.parentId!] ??= []).push(t);
  }

  async function updateType(formData: FormData) {
    "use server";
    await requireUnfrozen("/admin/settings/space-types");
    const id                = formData.get("id") as string;
    const label             = formData.get("label") as string;
    const dxfLayer          = (formData.get("dxfLayer") as string) || null;
    const dxfLabelLayer     = (formData.get("dxfLabelLayer") as string) || null;
    const dxfBlockPattern   = (formData.get("dxfBlockPattern") as string) || null;
    const dxfProcessingMode = (formData.get("dxfProcessingMode") as string) || null;
    const color             = (formData.get("color") as string) || null;
    const active            = formData.get("active") === "on";

    const before = await prisma.spaceTypeConfig.findUnique({ where: { id } });
    await prisma.spaceTypeConfig.update({
      where: { id },
      data: { label, dxfLayer, dxfLabelLayer, dxfBlockPattern, dxfProcessingMode, color, active },
    });
    await audit({
      actorId,
      action: "update",
      entityType: "SpaceTypeConfig",
      entityId: id,
      before: before ?? null,
      after: { label, dxfLayer, dxfLabelLayer, dxfBlockPattern, dxfProcessingMode, color, active },
    });
    redirect("/admin/settings/space-types");
  }

  async function createType(formData: FormData) {
    "use server";
    await requireUnfrozen("/admin/settings/space-types");
    const slug              = formData.get("slug") as string;
    const label             = formData.get("label") as string;
    const dxfLayer          = (formData.get("dxfLayer") as string) || null;
    const dxfLabelLayer     = (formData.get("dxfLabelLayer") as string) || null;
    const dxfBlockPattern   = (formData.get("dxfBlockPattern") as string) || null;
    const dxfProcessingMode = (formData.get("dxfProcessingMode") as string) || null;
    const color             = (formData.get("color") as string) || null;
    const parentId          = (formData.get("parentId") as string) || null;
    const isBookable        = formData.get("isBookable") === "on";
    const isLeasable        = formData.get("isLeasable") === "on";

    const maxOrder = await prisma.spaceTypeConfig.aggregate({ _max: { sortOrder: true } });
    const sortOrder = (maxOrder._max.sortOrder ?? 0) + 1;

    const row = await prisma.spaceTypeConfig.create({
      data: { slug, label, dxfLayer, dxfLabelLayer, dxfBlockPattern, dxfProcessingMode, color, parentId, isBookable, isLeasable, sortOrder },
    });
    await audit({
      actorId,
      action: "create",
      entityType: "SpaceTypeConfig",
      entityId: row.id,
      before: null,
      after: { slug, label, dxfLayer, dxfLabelLayer, dxfBlockPattern, dxfProcessingMode, color, parentId, isBookable, isLeasable },
    });
    redirect("/admin/settings/space-types");
  }

  async function deleteType(formData: FormData) {
    "use server";
    await requireUnfrozen("/admin/settings/space-types");
    const id = formData.get("id") as string;
    const type = await prisma.spaceTypeConfig.findUnique({ where: { id } });
    if (!type) redirect("/admin/settings/space-types");
    const inUse = await prisma.resource.count({ where: { typeTag: type!.slug, deletedAt: null } });
    if (inUse > 0) redirect("/admin/settings/space-types?error=in-use");
    await prisma.spaceTypeConfig.delete({ where: { id } });
    await audit({
      actorId,
      action: "delete",
      entityType: "SpaceTypeConfig",
      entityId: id,
      before: { slug: type!.slug, label: type!.label },
      after: null,
    });
    redirect("/admin/settings/space-types");
  }

  function DxfModeSelect({ name, value }: { name: string; value: string | null }) {
    return (
      <select
        name={name}
        defaultValue={value ?? ""}
        className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400 h-7 bg-white"
      >
        {PROCESSING_MODES.map(m => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
    );
  }

  function TypeRow({ t, indent = false }: { t: typeof types[0]; indent?: boolean }) {
    return (
      <form action={updateType} className={`py-3 border-b last:border-0 ${indent ? "pl-6" : ""}`}>
        <input type="hidden" name="id" value={t.id} />
        {/* Row 1: display fields */}
        <div className="grid grid-cols-[1fr_100px_60px_auto_auto] gap-2 items-end mb-2">
          <div className="space-y-1">
            {!indent && <Label className="text-xs text-gray-500">Label</Label>}
            <Input name="label" defaultValue={t.label} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            {!indent && <Label className="text-xs text-gray-500">Color</Label>}
            <Input name="color" defaultValue={t.color ?? ""} placeholder="#f5f5f5" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            {!indent && <Label className="text-xs text-gray-500">Active</Label>}
            <div className="flex items-center h-8">
              <input type="checkbox" name="active" defaultChecked={t.active} className="rounded" />
            </div>
          </div>
          <div className={!indent ? "pt-5" : ""}>
            <Button type="submit" size="sm" variant="outline">Save</Button>
          </div>
          <form action={deleteType} className={!indent ? "pt-5" : ""}>
            <input type="hidden" name="id" value={t.id} />
            <Button type="submit" size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50">✕</Button>
          </form>
        </div>
        {/* Row 2: DXF import config */}
        <div className="grid grid-cols-[1fr_1fr_1fr_2fr] gap-2 items-start bg-gray-50 rounded p-2">
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">DXF layer</Label>
            <Input name="dxfLayer" defaultValue={t.dxfLayer ?? ""} placeholder="e.g. studio" className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">Label layer</Label>
            <Input name="dxfLabelLayer" defaultValue={t.dxfLabelLayer ?? ""} placeholder="e.g. studio_label" className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">Block pattern</Label>
            <Input name="dxfBlockPattern" defaultValue={t.dxfBlockPattern ?? ""} placeholder="e.g. sb-std" className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">Processing mode</Label>
            <DxfModeSelect name="dxfProcessingMode" value={t.dxfProcessingMode} />
          </div>
        </div>
      </form>
    );
  }

  return (
    <div>
      <div className="mb-4 space-y-1">
        <p className="text-sm text-gray-500">
          Rename types, change floor plan colors, or configure DXF import behaviour.
          The <span className="font-mono text-xs bg-gray-100 px-1 rounded">slug</span> is permanent once spaces are assigned.
        </p>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          DXF layer settings affect future imports only. Changing them does not re-process existing floor plans.
        </p>
      </div>

      {/* Existing types */}
      <div className="rounded-md border mb-8">
        <div className="grid grid-cols-[1fr_100px_60px_auto_auto] gap-2 px-3 py-2 bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wide">
          <span>Label</span>
          <span>Color</span>
          <span>Active</span>
          <span></span>
          <span></span>
        </div>
        <div className="px-3">
          {topLevel.map(t => (
            <div key={t.id}>
              <div className="flex items-center gap-2 pt-3 pb-1">
                <span className="font-mono text-xs text-gray-400">{t.slug}</span>
                {(t.isBookable || t.isLeasable) && (
                  <span className="text-xs text-gray-400">
                    {[t.isBookable && "bookable", t.isLeasable && "leasable"].filter(Boolean).join(" · ")}
                  </span>
                )}
                {t.dxfProcessingMode && (
                  <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1 rounded">{t.dxfProcessingMode}</span>
                )}
              </div>
              <TypeRow t={t} />
              {(byParent[t.id] ?? []).map(child => (
                <div key={child.id}>
                  <div className="flex items-center gap-2 pl-6 pt-2 pb-1">
                    <span className="font-mono text-xs text-gray-400">{child.slug}</span>
                    {child.dxfProcessingMode && (
                      <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1 rounded">{child.dxfProcessingMode}</span>
                    )}
                  </div>
                  <TypeRow t={child} indent />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Add new type */}
      <div className="border rounded-md p-4">
        <h3 className="text-sm font-medium mb-4">Add space type</h3>
        <form action={createType} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="new-slug" className="text-xs">Slug <span className="text-gray-400">(permanent)</span></Label>
              <Input id="new-slug" name="slug" placeholder="e.g. shelf-wide" required className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-label" className="text-xs">Label</Label>
              <Input id="new-label" name="label" placeholder="e.g. Wide Shelf" required className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-color" className="text-xs">Color <span className="text-gray-400">(optional hex)</span></Label>
              <Input id="new-color" name="color" placeholder="#fde8d8" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-parentId" className="text-xs">Parent type <span className="text-gray-400">(optional)</span></Label>
              <select
                id="new-parentId"
                name="parentId"
                className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 h-8 bg-white"
              >
                <option value="">— None (top-level) —</option>
                {topLevel.map(t => (
                  <option key={t.id} value={t.id}>{t.label} ({t.slug})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2 pt-1">
              <Label className="text-xs">Flags</Label>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5"><input type="checkbox" name="isBookable" /> Bookable</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" name="isLeasable" /> Leasable</label>
              </div>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs text-gray-500 mb-2 font-medium">DXF import config <span className="font-normal text-gray-400">(optional — configure if this type appears on the floor plan)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">DXF layer <span className="text-gray-400">(or prefix for multilevel)</span></Label>
                <Input name="dxfLayer" placeholder="e.g. shelf_l" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Label layer</Label>
                <Input name="dxfLabelLayer" placeholder="e.g. storage_label" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Block pattern <span className="text-gray-400">(prefix filter)</span></Label>
                <Input name="dxfBlockPattern" placeholder="e.g. sb-wide" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Processing mode</Label>
                <select
                  name="dxfProcessingMode"
                  className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 h-8 bg-white"
                >
                  {PROCESSING_MODES.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <Button type="submit" size="sm">Add type</Button>
        </form>
      </div>
    </div>
  );
}
