import type { DemoContext, TaskSnapshot } from "@/lib/client/contracts";
import { formatMoney } from "@/lib/presentation/money";

export function MarketplacePreview({ context, task }: { context?: DemoContext; task?: TaskSnapshot }) {
  const item = context?.inventory[0];
  const listing = task?.listings[0];
  return (
    <aside className="panel min-w-0 overflow-hidden" aria-labelledby="marketplace-heading">
      <div className="border-b border-slate-800 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Mock marketplace</p>
            <h2 id="marketplace-heading" className="mt-2 text-xl font-semibold text-white">Listing preview</h2>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${listing?.status === "PUBLISHED" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
            {listing?.status ?? "NOT LISTED"}
          </span>
        </div>
      </div>
      <div className="p-6">
        <div className="ticket-visual" aria-hidden="true">
          <span>RICE STADIUM</span>
          <strong>LIVE</strong>
          <small>GENERAL ADMISSION · 1 TICKET</small>
        </div>
        <h3 className="mt-5 text-lg font-semibold text-white">{listing?.title ?? item?.title ?? "Concert ticket"}</h3>
        <p className="mt-2 min-h-12 text-sm leading-6 text-slate-400">{listing?.description ?? item?.description ?? "Demo inventory will appear here."}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="metric-card">
            <span>Price</span>
            <strong>{formatMoney(listing?.priceCents, listing?.currency)}</strong>
          </div>
          <div className="metric-card">
            <span>Visibility</span>
            <strong>{listing?.status === "PUBLISHED" ? "Public" : "Private"}</strong>
          </div>
          <div className="metric-card">
            <span>Source</span>
            <strong>{item?.type.replaceAll("_", " ") ?? "Inventory"}</strong>
          </div>
          <div className="metric-card">
            <span>Version</span>
            <strong>{listing?.version ?? "—"}</strong>
          </div>
        </div>
        <p className="mt-5 border-t border-slate-800 pt-4 text-xs leading-5 text-slate-500">
          Before: owned inventory, no public listing. After authorization: priced and publicly visible.
        </p>
      </div>
    </aside>
  );
}
