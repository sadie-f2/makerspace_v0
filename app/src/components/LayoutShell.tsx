"use client";

import { useState } from "react";
import NavLinks from "@/components/NavLinks";

interface Props {
  title: string;
  headerRight: React.ReactNode;
  navLinks: { href: string; label: string }[];
  navLabel: string;
  frozenBanner?: React.ReactNode;
  children: React.ReactNode;
}

export default function LayoutShell({
  title,
  headerRight,
  navLinks,
  navLabel,
  frozenBanner,
  children,
}: Props) {
  const [navOpen, setNavOpen] = useState(true);

  return (
    <div className="min-h-screen flex flex-col h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setNavOpen((o) => !o)}
            aria-expanded={navOpen}
            aria-controls="sidebar-nav"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <rect y="3"  width="18" height="1.5" rx="0.75" fill="currentColor" />
              <rect y="8"  width="18" height="1.5" rx="0.75" fill="currentColor" />
              <rect y="13" width="18" height="1.5" rx="0.75" fill="currentColor" />
            </svg>
          </button>
          <span className="font-semibold text-sm">{title}</span>
        </div>
        {headerRight}
      </header>
      {frozenBanner}
      <div className="flex flex-1 overflow-hidden">
        <nav
          id="sidebar-nav"
          aria-label={navLabel}
          className={`bg-gray-50 border-r shrink-0 overflow-hidden transition-all duration-200 ${navOpen ? "w-48 px-3 py-4" : "w-0"}`}
        >
          <NavLinks links={navLinks} />
        </nav>
        <main id="main-content" className="flex-1 overflow-auto p-6 bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
