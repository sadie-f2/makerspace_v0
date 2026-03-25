import { auth } from "@/auth";

export default async function AdminPage() {
  const session = await auth();
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Dashboard</h2>
      <p className="text-gray-500 text-sm">Admin dashboard — coming soon.</p>
      <pre className="mt-4 text-xs text-gray-400">
        {JSON.stringify(session?.user, null, 2)}
      </pre>
    </div>
  );
}
