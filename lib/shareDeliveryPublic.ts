// lib/shareDeliveryPublic.ts
import { createClient } from "@supabase/supabase-js";

export type ShareDeliveryRow = {
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

export function areaLine(d?: string | null, k?: string | null) {
  const dd = String(d || "").trim();
  const kk = String(k || "").trim();
  if (dd && kk) return `${dd} ${kk} хороо`;
  if (dd) return dd;
  if (kk) return `${kk} хороо`;
  return "—";
}

export function fmtPrice(n: number | null | undefined) {
  const v = Number(n || 0);
  return v ? `${v.toLocaleString("mn-MN")}₮` : "Үнэ тохиролцоно";
}

export async function fetchShareDelivery(id: string) {
  const supabase = sb();

  // 1) deliveries_share (public-safe view)
  const a = await supabase
    .from("deliveries_share")
    .select(
      "id,status,price_mnt,note,pickup_district,pickup_khoroo,dropoff_district,dropoff_khoroo,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (a.data) return a.data as ShareDeliveryRow;

  // 2) fallback: deliveries (хэрвээ view байхгүй үед)
  const b = await supabase
    .from("deliveries")
    .select(
      "id,status,price_mnt,note,pickup_district,pickup_khoroo,dropoff_district,dropoff_khoroo,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (b.data) return b.data as ShareDeliveryRow;

  return null;
}
