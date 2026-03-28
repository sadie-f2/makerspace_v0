import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { IdentityProvider } from "./provider";
import { IdentityError } from "./types";

const BCRYPT_ROUNDS = 12;
const DEFAULT_PASSWORD = "changeme";

export const localIdentity: IdentityProvider = {
  name: "local",

  async provisionUser({ memberId, initialPassword }) {
    const plaintext = initialPassword ?? DEFAULT_PASSWORD;
    try {
      const passwordHash = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);
      await prisma.member.update({
        where: { id: memberId },
        data:  { passwordHash },
      });
    } catch (err) {
      throw new IdentityError(`Failed to provision credentials for member ${memberId}`, "provisionUser", err);
    }
  },

  async verifyCredentials(email, password) {
    const member = await prisma.member.findUnique({
      where:  { email, deletedAt: null },
      select: { passwordHash: true },
    });
    if (!member?.passwordHash) return false;
    return bcrypt.compare(password, member.passwordHash);
  },

  async setPassword({ memberId, newPassword }) {
    try {
      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      await prisma.member.update({
        where: { id: memberId },
        data:  { passwordHash },
      });
    } catch (err) {
      throw new IdentityError(`Failed to set password for member ${memberId}`, "setPassword", err);
    }
  },

  async deactivateUser(memberId) {
    try {
      await prisma.member.update({
        where: { id: memberId },
        data:  { deletedAt: new Date() },
      });
    } catch (err) {
      throw new IdentityError(`Failed to deactivate member ${memberId}`, "deactivateUser", err);
    }
  },

  async reactivateUser(memberId) {
    try {
      await prisma.member.update({
        where: { id: memberId },
        data:  { deletedAt: null },
      });
    } catch (err) {
      throw new IdentityError(`Failed to reactivate member ${memberId}`, "reactivateUser", err);
    }
  },
};
