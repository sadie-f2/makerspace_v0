#!/usr/bin/env python3
"""
check-licenses.py — audit npm dep licenses against an allowlist.

Run after any package-lock.json change (pnpm install, dep bumps):
    python tools/check-licenses.py

Exits 0 if nothing unexpected is found.
Exits 1 if a new non-allowlisted license appears — update NOTICE and
add an entry to EXCEPTIONS below, or remove the offending dep.
"""

import json
import sys
from pathlib import Path

LOCK = Path(__file__).parent.parent / "package-lock.json"

# ── Permissive — no action needed ────────────────────────────────────────────

ALLOW = {
    "MIT",
    "ISC",
    "Apache-2.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "0BSD",
    "MIT-0",
    "Unlicense",
    "CC0-1.0",
    "Python-2.0",               # OSI-approved permissive (argparse JS port)
    "(MIT OR CC0-1.0)",         # type-fest
    "CC-BY-4.0",                # caniuse-lite browser data; attribution in NOTICE §3
    # sharp Windows platform packages bundle libvips under these compound IDs:
    "Apache-2.0 AND LGPL-3.0-or-later",
    "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
}

# ── Known exceptions — non-permissive but reviewed and documented in NOTICE ──
#
# Format: package_name → (license, one-line justification)
# When adding a new exception, update NOTICE too.

EXCEPTIONS = {

    # LGPL-3.0-or-later — libvips pre-compiled native binaries.
    # Depended on transitively by Next.js via @img/sharp.
    # Server-side only; not distributed to end users. NOTICE §1.
    "@img/sharp-libvips-darwin-arm64":    ("LGPL-3.0-or-later", "libvips native binary, server-side — NOTICE §1"),
    "@img/sharp-libvips-darwin-x64":      ("LGPL-3.0-or-later", "libvips native binary, server-side — NOTICE §1"),
    "@img/sharp-libvips-linux-arm":       ("LGPL-3.0-or-later", "libvips native binary, server-side — NOTICE §1"),
    "@img/sharp-libvips-linux-arm64":     ("LGPL-3.0-or-later", "libvips native binary, server-side — NOTICE §1"),
    "@img/sharp-libvips-linux-ppc64":     ("LGPL-3.0-or-later", "libvips native binary, server-side — NOTICE §1"),
    "@img/sharp-libvips-linux-riscv64":   ("LGPL-3.0-or-later", "libvips native binary, server-side — NOTICE §1"),
    "@img/sharp-libvips-linux-s390x":     ("LGPL-3.0-or-later", "libvips native binary, server-side — NOTICE §1"),
    "@img/sharp-libvips-linux-x64":       ("LGPL-3.0-or-later", "libvips native binary, server-side — NOTICE §1"),
    "@img/sharp-libvips-linuxmusl-arm64": ("LGPL-3.0-or-later", "libvips native binary, server-side — NOTICE §1"),
    "@img/sharp-libvips-linuxmusl-x64":   ("LGPL-3.0-or-later", "libvips native binary, server-side — NOTICE §1"),

    # MPL-2.0 — build-time only, never deployed. NOTICE §2.
    "lightningcss":                       ("MPL-2.0", "CSS compiler via Tailwind v4, build-time only — NOTICE §2"),
    "lightningcss-android-arm64":         ("MPL-2.0", "CSS compiler, build-time only — NOTICE §2"),
    "lightningcss-darwin-arm64":          ("MPL-2.0", "CSS compiler, build-time only — NOTICE §2"),
    "lightningcss-darwin-x64":            ("MPL-2.0", "CSS compiler, build-time only — NOTICE §2"),
    "lightningcss-freebsd-x64":           ("MPL-2.0", "CSS compiler, build-time only — NOTICE §2"),
    "lightningcss-linux-arm-gnueabihf":   ("MPL-2.0", "CSS compiler, build-time only — NOTICE §2"),
    "lightningcss-linux-arm64-gnu":       ("MPL-2.0", "CSS compiler, build-time only — NOTICE §2"),
    "lightningcss-linux-arm64-musl":      ("MPL-2.0", "CSS compiler, build-time only — NOTICE §2"),
    "lightningcss-linux-x64-gnu":         ("MPL-2.0", "CSS compiler, build-time only — NOTICE §2"),
    "lightningcss-linux-x64-musl":        ("MPL-2.0", "CSS compiler, build-time only — NOTICE §2"),
    "lightningcss-win32-arm64-msvc":      ("MPL-2.0", "CSS compiler, build-time only — NOTICE §2"),
    "lightningcss-win32-x64-msvc":        ("MPL-2.0", "CSS compiler, build-time only — NOTICE §2"),
    "axe-core":                           ("MPL-2.0", "accessibility linter, dev-time only — NOTICE §2"),

    # No license declared — transitive via prisma → mysql2. NOTICE §6.
    "seq-queue":                          ("UNKNOWN", "no license; transitive prisma→mysql2→seq-queue — NOTICE §6"),
}


def main():
    if not LOCK.exists():
        sys.exit(f"ERROR: {LOCK} not found")

    with open(LOCK) as f:
        data = json.load(f)

    pkgs = data.get("packages", {})
    ok = 0
    excepted = []
    issues = []

    for path, meta in pkgs.items():
        # Top-level node_modules only (skip nested / workspace entries)
        if not path.startswith("node_modules/") or path.count("node_modules/") != 1:
            continue

        name = path.removeprefix("node_modules/")
        license_ = meta.get("license", "UNKNOWN")
        version = meta.get("version", "?")

        if license_ in ALLOW:
            ok += 1
        elif name in EXCEPTIONS:
            excepted.append((name, version, license_, EXCEPTIONS[name][1]))
        else:
            issues.append((name, version, license_))

    # ── Report ────────────────────────────────────────────────────────────────
    print(f"✓  {ok} packages on allowlist\n")

    if excepted:
        print(f"⚠  {len(excepted)} known exception(s) — documented in NOTICE:")
        for name, ver, lic, reason in sorted(excepted):
            print(f"   {name}@{ver}  [{lic}]")
            print(f"     → {reason}")
        print()

    if issues:
        print(f"✗  {len(issues)} UNEXPECTED license(s) — review required:")
        print("   Either add an EXCEPTIONS entry + update NOTICE, or remove the dep.\n")
        for name, ver, lic in sorted(issues):
            print(f"   {name}@{ver}  [{lic}]")
        sys.exit(1)

    print("✓  No unexpected licenses.")


if __name__ == "__main__":
    main()
