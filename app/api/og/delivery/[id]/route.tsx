import { ImageResponse } from "next/og";

export const runtime = "edge";

type ShareRow = {
  id: string;
  price_mnt: number | null;
  note: string | null;
  pickup_district: string | null;
  pickup_khoroo: string | null;
  dropoff_district: string | null;
  dropoff_khoroo: string | null;
};

function areaLine(d?: string | null, k?: string | null) {
  const dd = String(d || "").trim();
  const kk = String(k || "").trim();
  if (dd && kk) return `${dd} ${kk} хороо`;
  if (dd) return dd;
  if (kk) return `${kk} хороо`;
  return "—";
}

async function fetchShareRow(id: string): Promise<ShareRow | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const res = await fetch(
    `${url}/rest/v1/deliveries_share?id=eq.${encodeURIComponent(
      id
    )}&select=id,price_mnt,note,pickup_district,pickup_khoroo,dropoff_district,dropoff_khoroo`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  return data?.[0] ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } } // ✅ PROMISE БИШ
) {
  const id = params.id;

  const d = await fetchShareRow(id);
  const from = d ? areaLine(d.pickup_district, d.pickup_khoroo) : "—";
  const to = d ? areaLine(d.dropoff_district, d.dropoff_khoroo) : "—";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 48,
          background: "#fff",
          color: "#0f172a",
        }}
      >
        🚚 {from} → {to}
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    }
  );
}
