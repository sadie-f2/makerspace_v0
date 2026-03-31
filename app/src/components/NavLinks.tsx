"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLinks({
  links,
}: {
  links: { href: string; label: string }[];
}) {
  const pathname = usePathname();

  return (
    <ul className="space-y-1">
      {links.map(({ href, label }) => {
        const current = pathname === href || (href !== "/portal" && href !== "/admin" && pathname.startsWith(href));
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              className="block px-3 py-2 rounded text-sm text-gray-700 hover:bg-gray-200"
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
