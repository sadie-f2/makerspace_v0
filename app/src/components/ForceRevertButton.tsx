"use client";

/**
 * ADMIN-only button that submits a force-revert form after a browser confirmation.
 * Used in the audit log UI for entries outside the 1-hour undo window.
 */
export default function ForceRevertButton({
  logId,
  action,
}: {
  logId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const ok = window.confirm(
          "Force-revert this change?\n\n" +
          "This bypasses the 1-hour undo window. " +
          "External effects (Stripe, Brivo) will need manual correction if applicable.",
        );
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="logId" value={logId} />
      <button
        type="submit"
        className="text-xs px-2 py-1 rounded border border-orange-300 text-orange-700 hover:bg-orange-50"
      >
        Force revert
      </button>
    </form>
  );
}
