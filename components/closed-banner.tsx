import { STORE_OPEN, STORE_CLOSED_MSG } from "@/lib/flags";

export default function ClosedBanner() {
  if (STORE_OPEN) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {STORE_CLOSED_MSG}
      </div>
    </div>
  );
}
