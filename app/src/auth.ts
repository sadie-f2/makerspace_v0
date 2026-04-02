import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { identity } from "@/lib/identity";
import type { MemberRole } from "@/generated/prisma/enums";

const VALID_ROLES: readonly string[] = ["MEMBER", "VOLUNTEER", "STAFF", "ADMIN"];
function assertRole(value: unknown): MemberRole {
  if (typeof value === "string" && VALID_ROLES.includes(value)) {
    return value as MemberRole;
  }
  return "MEMBER"; // safe default — never escalates, always degrades
}

// Extend NextAuth types to carry makerspace-specific session data
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: MemberRole;
      tierId: string | null;
    };
  }
  interface User {
    role: MemberRole;
    tierId: string | null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },

  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const valid = await identity.verifyCredentials(email, password);
        if (!valid) return null;

        const member = await prisma.member.findUnique({
          where:  { email, deletedAt: null },
          select: { id: true, name: true, email: true, role: true, tierId: true, emailConfirmCode: true },
        });
        if (!member) return null;
        // Registered but not yet email-confirmed
        if (member.emailConfirmCode !== null) return null;

        return {
          id:     member.id,
          name:   member.name,
          email:  member.email,
          role:   member.role,
          tierId: member.tierId,
        };
      },
    }),
    // OktaProvider will be added here when sandbox credentials are available
  ],

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.tierId = user.tierId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      session.user.role = assertRole(token.role);
      session.user.tierId = (token.tierId ?? null) as string | null;
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
});
