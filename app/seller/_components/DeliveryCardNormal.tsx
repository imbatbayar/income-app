import type { DeliveryRowSeller } from "@/lib/deliveries";
import {
  badge,
  areaLine,
  fmtPrice,
  routeHHMM,
  routeTotalHours,
} from "@/app/seller/_lib/sellerUtils";

type Props = {
  d: DeliveryRowSeller;
  actLoading: Record<string, boolean>;
  onOpenDetail: (d: DeliveryRowSeller) => void;
  onMarkPickedUp: (deliveryId: string) => void;
  onDeleteDelivered: (deliveryId: string) => void;
};

export default function DeliveryCardNormal({
  d,
  actLoading,
  onOpenDetail,
  onMarkPickedUp,
  onDeleteDelivered,
}: Props) {
  const b = badge(d.status);
  const fromArea = areaLine(d.pickup_district, d.pickup_khoroo);
  const toArea = areaLine(d.dropoff_district, d.dropoff_khoroo);

  const hhmm = d.status === "ON_ROUTE" ? routeHHMM(d.on_route_at) : "00:00";
  const hours = d.status === "ON_ROUTE" ? routeTotalHours(d.on_route_at) : 0;
  const isLate = d.status === "ON_ROUTE" && hours >= 3;

  return (
    <div
      className={[
        "rounded-2xl border p-4",
        d.status === "PAID"
          ? "border-emerald-200 bg-emerald-50/40"
          : "border-slate-200 bg-white",
      ].join(" ")}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${b.cls}`}
            >
              {b.text}
            </span>

            {/* ✅ ON_ROUTE дээр цаг:минут */}
            {d.status === "ON_ROUTE" && (
              <span
                className={[
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-extrabold",
                  isLate
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-emerald-200 bg-emerald-50/70 text-emerald-700",
                ].join(" ")}
                title="Замд гарснаас хойш"
              >
                ⏱ {hhmm}
              </span>
            )}
          </div>

          <div className="mt-2 text-sm font-semibold">
            <span className="text-emerald-700">{fromArea}</span>
            <span className="mx-2 text-slate-400">→</span>
            <span className="text-emerald-900">{toArea}</span>
          </div>

          <div className="mt-2 text-sm font-bold text-emerald-700">
            {fmtPrice(d.price_mnt)}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <button
            onClick={() => onOpenDetail(d)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-slate-300"
          >
            Дэлгэрэнгүй
          </button>

          {d.status === "ASSIGNED" && (
            <button
              onClick={() => onMarkPickedUp(d.id)}
              disabled={!!actLoading[d.id]}
              className={[
                "rounded-xl px-4 py-2 text-sm font-semibold text-white",
                actLoading[d.id]
                  ? "bg-emerald-400"
                  : "bg-emerald-600 hover:bg-emerald-700",
              ].join(" ")}
            >
              Жолооч барааг авч явлаа
            </button>
          )}

          {/* ✅ DELIVERED + PAID дээр delete харагдана */}
          {(d.status === "DELIVERED" || d.status === "PAID") && (
            <button
              onClick={() => onDeleteDelivered(d.id)}
              disabled={!!actLoading[d.id]}
              className={[
                "rounded-xl px-4 py-2 text-sm font-semibold text-white",
                actLoading[d.id]
                  ? "bg-slate-400"
                  : "bg-slate-900 hover:bg-slate-800",
              ].join(" ")}
            >
              delete 🗑️
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
