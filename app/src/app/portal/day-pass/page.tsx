import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function DayPassPage({
  searchParams,
}: {
  searchParams: { requested?: string };
}) {
  const session = await auth();
  const memberId = session!.user.id;

  const passes = await prisma.dayPass.findMany({
    where: { memberId },
    orderBy: { validDate: "desc" },
    take: 20,
  });

  const today = new Date().toISOString().split("T")[0];

  async function requestDayPass(formData: FormData) {
    "use server";
    const dateStr = formData.get("validDate") as string;
    if (!dateStr) return;
    const validDate = new Date(dateStr);
    // TODO: initiate Stripe payment here; for now, create pass record directly
    await prisma.dayPass.create({
      data: { memberId, validDate },
    });
    redirect("/portal/day-pass?requested=1");
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold mb-2">Day Pass</h2>
      <p className="text-sm text-gray-500 mb-6">
        Purchase a single-day access pass. Payment processing coming soon —
        passes issued here will be confirmed by staff.
      </p>

      {/* Request form */}
      <section className="mb-8 border rounded p-4">
        <h3 className="text-sm font-medium mb-3">Request a day pass</h3>
        <form action={requestDayPass} className="flex gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Date</label>
            <input
              name="validDate"
              type="date"
              min={today}
              defaultValue={today}
              required
              className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 h-9"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded hover:bg-gray-700 h-9"
          >
            Request
          </button>
        </form>
        {searchParams.requested && (
          <p className="text-sm text-green-600 mt-3">
            Day pass requested — staff will confirm shortly.
          </p>
        )}
      </section>

      {/* History */}
      {passes.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">History</h3>
          <ul className="border rounded divide-y text-sm">
            {passes.map(p => (
              <li key={p.id} className="px-4 py-2.5 flex items-center justify-between">
                <span>{new Date(p.validDate).toLocaleDateString()}</span>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  {p.fobNumber && <span>Fob #{p.fobNumber}</span>}
                  {p.returnedAt ? (
                    <span className="text-gray-400">returned</span>
                  ) : (
                    <span className="text-amber-600">fob out</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
