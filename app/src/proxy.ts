import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

// proxy.ts (Next.js 16) — runs on Node.js runtime, so auth/Prisma imports are safe.
export async function proxy(req: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*", "/admin/:path*"],
};
