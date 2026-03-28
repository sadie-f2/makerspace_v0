import { redirect } from "next/navigation";
import { prisma } from "./prisma";

// Short-lived in-process cache — avoids a DB hit on every server action
// while keeping the freeze responsive (5-second propagation delay is acceptable)
let _cache: { frozen: boolean; at: number } | null = null;
const TTL_MS = 5_000;

export async function isSystemFrozen(): Promise<boolean> {
  const now = Date.now();
  if (_cache && now - _cache.at < TTL_MS) return _cache.frozen;
  const config = await prisma.systemConfig.findFirst({ select: { systemFreeze: true } });
  const frozen = config?.systemFreeze ?? false;
  _cache = { frozen, at: now };
  return frozen;
}

/** Call at the top of any mutating server action. Redirects with ?frozen=1 if system is frozen. */
export async function requireUnfrozen(redirectTo: string): Promise<void> {
  if (await isSystemFrozen()) {
    redirect(`${redirectTo}?frozen=1`);
  }
}

/** Invalidate the in-process cache — call after toggling freeze state. */
export function invalidateFreezeCache(): void {
  _cache = null;
}
