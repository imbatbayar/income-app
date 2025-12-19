// app/share/delivery/[id]/page.tsx
import type { Metadata } from "next";
import DeliveryRouteMap from "@/app/components/Map/DeliveryRouteMap";
import { createClient } from "@supabase/supabase-js";

type ShareRow = {
  id: string;
  status: string;
  price_mnt: number | null;
  note: string | null;

  pickup_district: string | null;
  pickup_khoroo: string | null;
  dropoff_district: string | null;
  dropoff_khoroo: string | null;

  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;

  created_at: string;
};

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function areaLine(d?: string | null, k?: string | null) {
  const dd = String(d || "").trim();
  const kk = String(k || "").trim();
  if (dd && kk) return `${dd} ${kk} хороо`;
  if (dd) return dd;
  if (kk) return `${kk} хороо`;
  return "—";
}

function fmtPrice(n: number | null | undefined) {
  const v = Number(n || 0);
  return v ? `${v.toLocaleString("mn-MN")}₮` : "Үнэ тохиролцоно";
}

async function fetchShareDelivery(id: string): Promise<ShareRow | null> {
  const supabase = sb();

  // ✅ Хэрвээ deliveries_share view байвал түүгээр нь
  const a = await supabase
    .from("deliveries_share")
    .select(
      "id,status,price_mnt,note,pickup_district,pickup_khoroo,dropoff_district,dropoff_khoroo,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (a.data) return a.data as ShareRow;

  // ✅ fallback (view байхгүй үед)
  const b = await supabase
    .from("deliveries")
    .select(
      "id,status,price_mnt,note,pickup_district,pickup_khoroo,dropoff_district,dropoff_khoroo,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (b.data) return b.data as ShareRow;

  return null;
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const d = await fetchShareDelivery(params.id);

  const title = d
    ? `Хүргэлт · ${areaLine(d.pickup_district, d.pickup_khoroo)} → ${areaLine(
        d.dropoff_district,
        d.dropoff_khoroo
      )}`
    : "Хүргэлт";

  const description = d
    ? `Үнэ: ${fmtPrice(d.price_mnt)}${d.note ? ` · ${d.note}` : ""}`
    : "INCOME хүргэлт";

  // ✅ OG зураг руу заана
  const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://income.mn";

  const og = `${siteUrl}/api/og/delivery/${params.id}`;


  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: og, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [og],
    },
  };
}

export default async function ShareDeliveryPage({
  params,
}: {
  params: { id: string };
}) {
  const d = await fetchShareDelivery(params.id);

  if (!d) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
            Хүргэлт олдсонгүй.
          </div>
        </div>
      </div>
    );
  }

  // ✅ public preview дээр private info байхгүй
  const from = areaLine(d.pickup_district, d.pickup_khoroo);
  const to = areaLine(d.dropoff_district, d.dropoff_khoroo);

  const pickup =
    d.pickup_lat == null || d.pickup_lng == null
      ? null
      : { lat: Number(d.pickup_lat), lng: Number(d.pickup_lng) };

  const dropoff =
    d.dropoff_lat == null || d.dropoff_lng == null
      ? null
      : { lat: Number(d.dropoff_lat), lng: Number(d.dropoff_lng) };

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-500">
                INCOME · Public preview
              </div>
              <div className="mt-1 text-sm font-extrabold text-slate-900">
                {from} <span className="mx-1 text-slate-400">→</span> {to}
              </div>
            </div>

            <div className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50/70 px-3 py-1 text-sm font-extrabold text-emerald-700">
              {fmtPrice(d.price_mnt)}
            </div>
          </div>

          {d.note ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm font-semibold text-emerald-900">
              📦 {d.note}
            </div>
          ) : null}

          <div className="mt-3 text-xs text-slate-500">
            (Энд утас, дэлгэрэнгүй хаяг харагдахгүй. Аюулгүй share preview.)
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">Газрын зураг</div>
            <div className="mt-0.5 text-xs text-slate-500">Авах · Хүргэх</div>
          </div>
          <DeliveryRouteMap pickup={pickup} dropoff={dropoff} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">
            Жолооч бол апп руу ороод хүргэлтийг нээ.
          </div>
          <div className="mt-2 flex gap-2">
            <a
              href={`/driver?open=${encodeURIComponent(d.id)}`}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
            >
              Апп руу нээх
            </a>
            <a
              href="/"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-slate-300"
            >
              Нүүр
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
