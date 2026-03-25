"use server";
import { redirect } from "next/navigation";
import Link from "next/link";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default async function NewMemberPage() {
  const tiers = await prisma.memberTier.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  async function createMember(formData: FormData) {
    "use server";
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const phone = (formData.get("phone") as string) || null;
    const tierId = (formData.get("tierId") as string) || null;
    const password = formData.get("password") as string;

    const passwordHash = await bcrypt.hash(password || "changeme", 12);

    const member = await prisma.member.create({
      data: { name, email, phone, tierId, passwordHash },
    });

    redirect(`/admin/members/${member.id}`);
  }

  return (
    <div className="max-w-lg">
      <div className="mb-4">
        <Link href="/admin/members" className="text-sm text-gray-500 hover:underline">
          ← Members
        </Link>
      </div>
      <h2 className="text-lg font-semibold mb-6">New Member</h2>

      <form action={createMember} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" name="phone" type="tel" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tierId">Membership tier</Label>
          <Select name="tierId">
            <SelectTrigger>
              <SelectValue placeholder="Select tier…" />
            </SelectTrigger>
            <SelectContent>
              {tiers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} — ${Number(t.monthlyRate).toFixed(0)}/mo
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="password">
            Temporary password{" "}
            <span className="text-gray-400 font-normal">(defaults to "changeme")</span>
          </Label>
          <Input id="password" name="password" type="text" placeholder="changeme" />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit">Create member</Button>
          <Link href="/admin/members">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
