import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // ---------------------------------------------------------------------------
  // Member tiers
  // ---------------------------------------------------------------------------
  const tiers = [
    { name: "Standard",   slug: "standard",   monthlyRate: 75,  canBook: true,  canRentStudio: false, canRentStorage: true,  buildingAccess: true,  active: true,  sortOrder: 1 },
    { name: "24/7",       slug: "247",        monthlyRate: 150, canBook: true,  canRentStudio: true,  canRentStorage: true,  buildingAccess: true,  active: true,  sortOrder: 2 },
    { name: "Scholarship",slug: "scholarship",monthlyRate: 40,  canBook: true,  canRentStudio: false, canRentStorage: true,  buildingAccess: true,  active: true,  sortOrder: 3 },
    { name: "Day Pass",   slug: "day-pass",   monthlyRate: 0,   canBook: false, canRentStudio: false, canRentStorage: false, buildingAccess: false, active: false, sortOrder: 4 },
    { name: "Inactive",   slug: "inactive",   monthlyRate: 0,   canBook: false, canRentStudio: false, canRentStorage: false, buildingAccess: false, active: false, sortOrder: 5 },
  ];
  for (const tier of tiers) {
    await prisma.memberTier.upsert({ where: { slug: tier.slug }, update: {}, create: tier });
  }
  console.log(`Seeded ${tiers.length} member tiers`);

  // ---------------------------------------------------------------------------
  // System config
  // ---------------------------------------------------------------------------
  await prisma.systemConfig.upsert({
    where: { id: "system" }, update: {}, create: { id: "system", systemFreeze: false },
  });

  // ---------------------------------------------------------------------------
  // Studio sizes (allowed unit counts for studio assembly)
  // ---------------------------------------------------------------------------
  for (const [unitCount, sortOrder] of [[1, 0], [2, 1], [4, 2]] as const) {
    await prisma.studioSize.upsert({
      where: { unitCount },
      update: {},
      create: { unitCount, sortOrder },
    });
  }
  console.log("Seeded studio sizes: 1, 2, 4");

  // ---------------------------------------------------------------------------
  // Space type configuration
  // ---------------------------------------------------------------------------
  // Top-level types first (no parent)
  const topLevelTypes = [
    { slug: "org",          label: "Organization",  dxfLayer: null,      color: null,      isBookable: false, isLeasable: false, sortOrder: 0 },
    { slug: "shop",         label: "Shop",          dxfLayer: "shop",    color: "#dbeafe", isBookable: true,  isLeasable: false, sortOrder: 1 },
    { slug: "tool",         label: "Tool",          dxfLayer: null,      color: null,      isBookable: true,  isLeasable: false, sortOrder: 2 },
    { slug: "meeting_room", label: "Meeting Room",  dxfLayer: null,      color: "#fef9c3", isBookable: true,  isLeasable: false, sortOrder: 3 },
    { slug: "studio_unit",  label: "Studio Unit",   dxfLayer: "studio",  color: "#dcfce7", isBookable: false, isLeasable: true,  sortOrder: 4 },
    { slug: "storage_unit", label: "Storage",       dxfLayer: "storage", color: "#fde8d8", isBookable: false, isLeasable: true,  sortOrder: 5 },
    { slug: "common_area",  label: "Common Area",   dxfLayer: "common",  color: "#f5f5f5", isBookable: false, isLeasable: false, sortOrder: 6 },
  ];
  const typeMap: Record<string, string> = {};
  for (const t of topLevelTypes) {
    const row = await prisma.spaceTypeConfig.upsert({
      where: { slug: t.slug },
      update: {},
      create: t,
    });
    typeMap[t.slug] = row.id;
  }

  // Storage subtypes (children of storage_unit)
  const storageSubtypes = [
    { slug: "storage_pallet",    label: "Pallet",    dxfLayer: "storage",  color: null, isBookable: false, isLeasable: true, sortOrder: 0 },
    { slug: "storage_shelf",     label: "Shelf",     dxfLayer: "shelf_l*", color: null, isBookable: false, isLeasable: true, sortOrder: 1 },
    { slug: "storage_tool_cart", label: "Tool Cart", dxfLayer: "storage",  color: null, isBookable: false, isLeasable: true, sortOrder: 2 },
  ];
  for (const t of storageSubtypes) {
    await prisma.spaceTypeConfig.upsert({
      where: { slug: t.slug },
      update: {},
      create: { ...t, parentId: typeMap["storage_unit"] },
    });
  }
  console.log(`Seeded ${topLevelTypes.length + storageSubtypes.length} space type configs`);

  // ---------------------------------------------------------------------------
  // Equipment classes
  // ---------------------------------------------------------------------------
  const classes = [
    { name: "Laser",    description: "Laser cutters and engravers" },
    { name: "CNC",      description: "CNC routers and mills" },
    { name: "Woodshop", description: "Stationary woodworking equipment" },
    { name: "Metal",    description: "Welding and metal fabrication" },
    { name: "3D Print", description: "FDM and resin 3D printers" },
    { name: "Vinyl",    description: "Vinyl cutters and heat press" },
  ];
  const classMap: Record<string, string> = {};
  for (const ec of classes) {
    const row = await prisma.equipmentClass.upsert({
      where: { name: ec.name }, update: {}, create: ec,
    });
    classMap[ec.name] = row.id;
  }
  console.log(`Seeded ${classes.length} equipment classes`);

  // ---------------------------------------------------------------------------
  // Resource tree
  // ---------------------------------------------------------------------------
  async function upsertResource(data: {
    name: string;
    typeTag: string;
    description?: string;
    parentId?: string | null;
    reservable?: boolean;
    leasable?: boolean;
    reservationMode?: "EXCLUSIVE" | "ADVISORY" | "NONE";
    requiresCertClassId?: string | null;
  }) {
    const existing = await prisma.resource.findFirst({
      where: { name: data.name, deletedAt: null },
    });
    if (existing) return existing;
    return prisma.resource.create({ data: { ...data } });
  }

  // Root org node
  const org = await upsertResource({ name: "Artisans Asylum", typeTag: "org" });

  // Shops
  const laserShop  = await upsertResource({ name: "Laser Shop",  typeTag: "shop", parentId: org.id, reservable: true,  reservationMode: "EXCLUSIVE" });
  const cncShop    = await upsertResource({ name: "CNC Shop",    typeTag: "shop", parentId: org.id, reservable: true,  reservationMode: "EXCLUSIVE" });
  const woodshop   = await upsertResource({ name: "Woodshop",    typeTag: "shop", parentId: org.id, reservable: true,  reservationMode: "ADVISORY"  });
  const metalShop  = await upsertResource({ name: "Metal Shop",  typeTag: "shop", parentId: org.id, reservable: true,  reservationMode: "ADVISORY"  });
  const fabrication= await upsertResource({ name: "Fabrication", typeTag: "shop", parentId: org.id, reservable: false });

  // Meeting rooms
  const meetingA = await upsertResource({ name: "Meeting Room A", typeTag: "meeting_room", parentId: org.id, reservable: true, reservationMode: "EXCLUSIVE" });
  const meetingB = await upsertResource({ name: "Meeting Room B", typeTag: "meeting_room", parentId: org.id, reservable: true, reservationMode: "EXCLUSIVE" });

  // Tools — Laser Shop
  await upsertResource({ name: "Epilog Laser (60W)",   typeTag: "tool", parentId: laserShop.id,  reservable: true, reservationMode: "EXCLUSIVE", requiresCertClassId: classMap["Laser"] });
  await upsertResource({ name: "Trotec Laser (80W)",   typeTag: "tool", parentId: laserShop.id,  reservable: true, reservationMode: "EXCLUSIVE", requiresCertClassId: classMap["Laser"] });
  await upsertResource({ name: "Vinyl Cutter",         typeTag: "tool", parentId: laserShop.id,  reservable: true, reservationMode: "EXCLUSIVE", requiresCertClassId: classMap["Vinyl"] });

  // Tools — CNC Shop
  await upsertResource({ name: "ShopBot CNC Router",   typeTag: "tool", parentId: cncShop.id,    reservable: true, reservationMode: "EXCLUSIVE", requiresCertClassId: classMap["CNC"] });
  await upsertResource({ name: "Tormach Mill",         typeTag: "tool", parentId: cncShop.id,    reservable: true, reservationMode: "EXCLUSIVE", requiresCertClassId: classMap["CNC"] });

  // Tools — Woodshop
  await upsertResource({ name: "Table Saw",            typeTag: "tool", parentId: woodshop.id,   reservable: true, reservationMode: "EXCLUSIVE", requiresCertClassId: classMap["Woodshop"] });
  await upsertResource({ name: "Band Saw",             typeTag: "tool", parentId: woodshop.id,   reservable: true, reservationMode: "EXCLUSIVE", requiresCertClassId: classMap["Woodshop"] });
  await upsertResource({ name: "Jointer",              typeTag: "tool", parentId: woodshop.id,   reservable: true, reservationMode: "EXCLUSIVE", requiresCertClassId: classMap["Woodshop"] });
  await upsertResource({ name: "Planer",               typeTag: "tool", parentId: woodshop.id,   reservable: true, reservationMode: "EXCLUSIVE", requiresCertClassId: classMap["Woodshop"] });

  // Tools — Metal Shop
  await upsertResource({ name: "MIG Welder",           typeTag: "tool", parentId: metalShop.id,  reservable: true, reservationMode: "EXCLUSIVE", requiresCertClassId: classMap["Metal"] });
  await upsertResource({ name: "TIG Welder",           typeTag: "tool", parentId: metalShop.id,  reservable: true, reservationMode: "EXCLUSIVE", requiresCertClassId: classMap["Metal"] });
  await upsertResource({ name: "Plasma Cutter",        typeTag: "tool", parentId: metalShop.id,  reservable: true, reservationMode: "EXCLUSIVE", requiresCertClassId: classMap["Metal"] });

  // Tools — Fabrication
  await upsertResource({ name: "Prusa MK4 (×4)",       typeTag: "tool", parentId: fabrication.id, reservable: true, reservationMode: "ADVISORY",  requiresCertClassId: classMap["3D Print"] });
  await upsertResource({ name: "Bambu X1C",            typeTag: "tool", parentId: fabrication.id, reservable: true, reservationMode: "EXCLUSIVE", requiresCertClassId: classMap["3D Print"] });

  console.log("Seeded resource tree");

  // ---------------------------------------------------------------------------
  // Admin user
  // ---------------------------------------------------------------------------
  const passwordHash = await bcrypt.hash("changeme", 12);
  await prisma.member.upsert({
    where: { email: "admin@artisansasylum.com" },
    update: {},
    create: { email: "admin@artisansasylum.com", name: "Admin", role: "ADMIN", passwordHash },
  });

  // ---------------------------------------------------------------------------
  // 24 sample members spread across tiers
  // ---------------------------------------------------------------------------
  const tierRows = await prisma.memberTier.findMany({ orderBy: { sortOrder: "asc" } });
  const bySlug = Object.fromEntries(tierRows.map((t) => [t.slug, t.id]));
  const tierAssignment = (i: number) => {
    if (i <= 12) return bySlug["standard"];
    if (i <= 18) return bySlug["247"];
    if (i <= 22) return bySlug["scholarship"];
    return null;
  };
  const memberHash = await bcrypt.hash("changeme", 12);
  for (let i = 1; i <= 24; i++) {
    const letter = String.fromCharCode(64 + i);
    await prisma.member.upsert({
      where: { email: `member-${i}@example.com` },
      update: {},
      create: {
        name: `${i} ${letter}`,
        email: `member-${i}@example.com`,
        tierId: tierAssignment(i),
        passwordHash: memberHash,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Sample certifications for first few members
  // ---------------------------------------------------------------------------
  const sampleMembers = await prisma.member.findMany({
    where: { email: { in: ["member-1@example.com","member-2@example.com","member-3@example.com"] } },
  });
  const adminUser = await prisma.member.findUnique({ where: { email: "admin@artisansasylum.com" } });

  const certAssignments: Record<string, string[]> = {
    "member-1@example.com": ["Laser", "Woodshop"],
    "member-2@example.com": ["Laser", "CNC", "3D Print"],
    "member-3@example.com": ["Metal", "Woodshop"],
  };

  for (const member of sampleMembers) {
    const certNames = certAssignments[member.email] ?? [];
    for (const certName of certNames) {
      const classId = classMap[certName];
      if (!classId) continue;
      await prisma.certification.upsert({
        where: { memberId_equipmentClassId: { memberId: member.id, equipmentClassId: classId } },
        update: {},
        create: { memberId: member.id, equipmentClassId: classId, grantedById: adminUser!.id },
      });
    }
  }

  console.log("Seeded 24 sample members + certifications");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
