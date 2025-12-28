import ShareDeliveryButton from "@/app/components/ShareDeliveryButton";
import type { DeliveryRowSeller } from "@/lib/deliveries";
import { badge, areaLine, fmtPrice, shorten } from "@/app/seller/_lib/sellerUtils";

type Props = {
  d: DeliveryRowSeller;
  onOpenDetail: (d: DeliveryRowSeller) => void;
  onToast: (text: string) => void;
};

export default function OpenCard({ d, onOpenDetail, onToast }: Props) {
  const b = badge(d.status);
  const fromArea = areaLine(d.pickup_district, d.pickup_khoroo);
  const toArea = areaLine(d.dropoff_district, d.dropoff_khoroo);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${b.cls}`}
            >
              {b.text}
            </span>

            {typeof d.bid_count === "number" && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                Санал: {d.bid_count}
              </span>
            )}
          </div>

          <div className="mt-2 text-sm font-semibold leading-snug">
            <span className="text-emerald-700">{fromArea}</span>
            <span className="mx-2 text-slate-400">→</span>
            <span className="text-emerald-900">{toArea}</span>
          </div>
        </div>

        <div className="shrink-0">
          <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50/70 px-3 py-1 text-sm font-extrabold tracking-tight text-emerald-700">
            {fmtPrice(d.price_mnt)}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <button
          onClick={() => onOpenDetail(d)}
          className="inline-flex w-full items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100/70"
          title="Дэлгэрэнгүй"
        >
          <span className="text-emerald-700">📦</span>
          <span className="min-w-0 truncate text-emerald-900">
            {d.note ? shorten(d.note, 90) : "—"}
          </span>
        </button>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          onClick={() => onOpenDetail(d)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:border-slate-300"
          title="OPEN"
        >
          📂 OPEN
        </button>

        {/* ✅ зөвхөн SHARE товч (payload-д map мэдээлэл өгнө) */}
        <ShareDeliveryButton
          payload={{
            id: d.id,
            from: fromArea,
            to: toArea,
            priceText: fmtPrice(d.price_mnt),
            note: d.note || "",

            // ✅ постерийн “гоё” хэсгүүд
            price_mnt: d.price_mnt,
            pickup_district: d.pickup_district,
            pickup_khoroo: d.pickup_khoroo,
            dropoff_district: d.dropoff_district,
            dropoff_khoroo: d.dropoff_khoroo,
            pickup_lat: d.pickup_lat,
            pickup_lng: d.pickup_lng,
            dropoff_lat: d.dropoff_lat,
            dropoff_lng: d.dropoff_lng,
          }}
          onToast={(t) => onToast(t)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:border-slate-300 disabled:opacity-60"
        />
      </div>
    </div>
  );
}
