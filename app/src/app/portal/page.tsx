import { auth } from "@/auth";

export default async function PortalPage() {
  const session = await auth();
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">
        Welcome, {session?.user.name}
      </h2>
      <p className="text-gray-500 text-sm">Member portal — coming soon.</p>
    </div>
  );
}
