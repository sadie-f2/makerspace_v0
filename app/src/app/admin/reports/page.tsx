import { requireStaff } from "@/lib/requireStaff";

export default async function ReportsPage() {
  await requireStaff();
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Reports</h2>
      <p className="text-gray-500 text-sm">Coming soon.</p>
    </div>
  );
}
