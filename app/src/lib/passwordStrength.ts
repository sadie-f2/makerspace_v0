export type PasswordRole = "MEMBER" | "VOLUNTEER" | "STAFF" | "ADMIN";

export interface PasswordCheck {
  ok: boolean;
  message?: string;
}

/**
 * Validate password strength based on the member's role.
 * MEMBER/VOLUNTEER: 8+ characters.
 * STAFF/ADMIN: 14+ characters with uppercase, lowercase, digit, and symbol.
 */
export function checkPasswordStrength(password: string, role: PasswordRole): PasswordCheck {
  if (role === "STAFF" || role === "ADMIN") {
    if (password.length < 14)
      return { ok: false, message: "Staff/admin passwords must be at least 14 characters." };
    if (!/[A-Z]/.test(password))
      return { ok: false, message: "Password must include an uppercase letter." };
    if (!/[a-z]/.test(password))
      return { ok: false, message: "Password must include a lowercase letter." };
    if (!/[0-9]/.test(password))
      return { ok: false, message: "Password must include a number." };
    if (!/[^A-Za-z0-9]/.test(password))
      return { ok: false, message: "Password must include a special character." };
  } else {
    if (password.length < 8)
      return { ok: false, message: "Password must be at least 8 characters." };
  }
  return { ok: true };
}

export const STRENGTH_REQUIREMENTS: Record<"elevated" | "standard", string[]> = {
  elevated: [
    "14+ characters",
    "Uppercase and lowercase letters",
    "At least one number",
    "At least one special character (!@#$… etc.)",
  ],
  standard: ["8+ characters"],
};
