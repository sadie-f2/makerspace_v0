/**
 * Seed load-test accounts into the local dev database.
 *
 * Run once before load testing:
 *   npx tsx tools/k6/seed-test-accounts.ts
 *
 * Creates:
 *   member1@loadtest.local  …  member10@loadtest.local   role: MEMBER
 *   admin1@loadtest.local   …  admin3@loadtest.local     role: ADMIN
 *
 * All accounts use the password defined by TEST_PASSWORD (default below).
 * Safe to re-run — uses upsert.
 */

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const PASSWORD = process.env.TEST_PASSWORD ?? "LoadTest!Dev1";
const MEMBER_COUNT = parseInt(process.env.MEMBER_COUNT ?? "10");
const ADMIN_COUNT  = parseInt(process.env.ADMIN_COUNT  ?? "3");

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  const accounts: { email: string; name: string; role: "MEMBER" | "ADMIN" }[] = [
    ...Array.from({ length: MEMBER_COUNT }, (_, i) => ({
      email: `member${i + 1}@loadtest.local`,
      name:  `Load Test Member ${i + 1}`,
      role:  "MEMBER" as const,
    })),
    ...Array.from({ length: ADMIN_COUNT }, (_, i) => ({
      email: `admin${i + 1}@loadtest.local`,
      name:  `Load Test Admin ${i + 1}`,
      role:  "ADMIN" as const,
    })),
  ];

  for (const acct of accounts) {
    const member = await prisma.member.upsert({
      where:  { email: acct.email },
      update: { passwordHash: hash, role: acct.role, deletedAt: null, requiresPasswordReset: false },
      create: {
        email:                acct.email,
        name:                 acct.name,
        role:                 acct.role,
        passwordHash:         hash,
        requiresPasswordReset: false,
      },
    });
    console.log(`  ${acct.role.padEnd(6)} ${acct.email}  (${member.id})`);
  }

  console.log(`\nDone. Password for all accounts: ${PASSWORD}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
