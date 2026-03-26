import Link from "next/link";

const settingsLinks = [
  { href: "/admin/settings", label: "General" },
  { href: "/admin/settings/space-types", label: "Space Types" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold mb-4">Settings</h2>
      <div className="flex gap-1 mb-6 border-b">
        {settingsLinks.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 -mb-px border-b-2 border-transparent hover:border-gray-400"
          >
            {label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
