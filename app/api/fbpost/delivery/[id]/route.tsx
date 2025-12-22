import { ImageResponse } from "next/og";

export const runtime = "nodejs";

type Delivery = {
  id: string;
  price_mnt: number | null;
  note: string | null;
  pickup_district: string | null;
  pickup_khoroo: string | null;
  dropoff_district: string | null;
  dropoff_khoroo: string | null;
  pickup_contact_phone: string | null;

  // OPTIONAL — байвал map гаргана
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
};

function areaDistrict(d?: string | null) {
  return (d || "—").toString().trim();
}
function areaKhoroo(k?: string | null) {
  return (k || "—").toString().trim();
}
function priceText(n?: number | null) {
  return n ? `${Number(n).toLocaleString("mn-MN")}₮` : "Тохиролцоно";
}

async function buildMapDataUrl(d: Delivery) {
  const token = (process.env.MAPBOX_ACCESS_TOKEN || "").trim();
  if (!token) return null;

  const aLat = Number(d.pickup_lat);
  const aLng = Number(d.pickup_lng);
  const bLat = Number(d.dropoff_lat);
  const bLng = Number(d.dropoff_lng);

  if (![aLat, aLng, bLat, bLng].every((x) => Number.isFinite(x))) return null;

  // Minimal geojson overlay: start/end points + line
  const geojson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { "marker-color": "#10b981" }, // emerald start
        geometry: { type: "Point", coordinates: [aLng, aLat] },
      },
      {
        type: "Feature",
        properties: { "marker-color": "#f97316" }, // orange end
        geometry: { type: "Point", coordinates: [bLng, bLat] },
      },
      {
        type: "Feature",
        properties: { stroke: "#0f172a", "stroke-width": 6 },
        geometry: {
          type: "LineString",
          coordinates: [
            [aLng, aLat],
            [bLng, bLat],
          ],
        },
      },
    ],
  };

  const overlay = `geojson(${encodeURIComponent(JSON.stringify(geojson))})`;
  const url =
    `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/` +
    `${overlay}/auto/980x520?padding=120&access_token=${token}`;

  const r = await fetch(url);
  if (!r.ok) return null;

  const buf = Buffer.from(await r.arrayBuffer());
  return `data:image/png;base64,${buf.toString("base64")}`;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
    if (!supabaseUrl || !supabaseKey) return new Response("Missing Supabase env", { status: 500 });

    // 👇 Хэрвээ lat/lng талбарууд чинь байхгүй бол select-оос устгаарай (гэхдээ map гарахгүй)
    const select =
      "id,price_mnt,note,pickup_district,pickup_khoroo,dropoff_district,dropoff_khoroo,pickup_contact_phone,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng";

    const res = await fetch(
      `${supabaseUrl}/rest/v1/deliveries?id=eq.${encodeURIComponent(id)}&select=${encodeURIComponent(select)}`,
      {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        cache: "no-store",
      }
    );

    const arr = await res.json().catch(() => []);
    const d: Delivery | undefined = arr?.[0];
    if (!d) return new Response("Not found", { status: 404 });

    const mapDataUrl = await buildMapDataUrl(d);

    const bg = "#f7f7f3";
    const green = "#0f6b46";
    const dark = "#0f172a";
    const muted = "#64748b";

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            background: bg,
            padding: 48,
            fontFamily: "ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto",
          }}
        >
          {/* TOP BAR */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", fontWeight: 900, letterSpacing: 1, color: green, fontSize: 28 }}>
              INCOME
            </div>
            <div style={{ display: "flex", fontWeight: 800, color: green, fontSize: 22 }}>
              БАРАА ХҮРГҮҮЛЭЕ
            </div>
          </div>

          {/* MAP CARD */}
          <div style={{ display: "flex", marginTop: 18 }}>
            <div
              style={{
                width: "100%",
                height: 540,
                borderRadius: 26,
                border: `3px solid ${green}`,
                overflow: "hidden",
                display: "flex",
                background: "#ffffff",
              }}
            >
              {mapDataUrl ? (
                <img
                  src={mapDataUrl}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "flex" as any }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: muted,
                    fontSize: 22,
                    padding: 24,
                    textAlign: "center",
                  }}
                >
                  Газрын зураг (route) оруулахын тулд pickup/dropoff координат хэрэгтэй.
                </div>
              )}
            </div>
          </div>

          {/* INFO BLOCK */}
          <div style={{ display: "flex", flexDirection: "column", marginTop: 26, gap: 14 }}>
            {/* PRICE ROW */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <div style={{ display: "flex", fontSize: 22, fontWeight: 900, color: green }}>
                ХҮРГҮҮЛЭХ ҮНЭ
              </div>
              <div style={{ display: "flex", flex: 1, height: 2, background: "#d1d5db" }} />
              <div style={{ display: "flex", fontSize: 34, fontWeight: 900, color: green }}>
                {priceText(d.price_mnt)}
              </div>
            </div>

            {/* FROM */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <div style={{ display: "flex", fontSize: 18, fontWeight: 900, color: green }}>ХААНААС</div>
              <div style={{ display: "flex", flex: 1, height: 2, background: "#d1d5db" }} />
              <div style={{ display: "flex", gap: 14, color: dark, fontSize: 20, fontWeight: 800 }}>
                <div style={{ display: "flex" }}>{areaDistrict(d.pickup_district)}</div>
                <div style={{ display: "flex", color: "#334155", fontWeight: 700 }}>
                  {areaKhoroo(d.pickup_khoroo)} - ХОРОО
                </div>
              </div>
            </div>

            {/* TO */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <div style={{ display: "flex", fontSize: 18, fontWeight: 900, color: green }}>ХААШАА</div>
              <div style={{ display: "flex", flex: 1, height: 2, background: "#d1d5db" }} />
              <div style={{ display: "flex", gap: 14, color: dark, fontSize: 20, fontWeight: 800 }}>
                <div style={{ display: "flex" }}>{areaDistrict(d.dropoff_district)}</div>
                <div style={{ display: "flex", color: "#334155", fontWeight: 700 }}>
                  {areaKhoroo(d.dropoff_khoroo)} - ХОРОО
                </div>
              </div>
            </div>

            {/* ITEM */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <div style={{ display: "flex", fontSize: 18, fontWeight: 900, color: green }}>ЮУ ХҮРГҮҮЛЭХ</div>
              <div style={{ display: "flex", flex: 1, height: 2, background: "#d1d5db" }} />
              <div style={{ display: "flex", color: dark, fontSize: 20, fontWeight: 800, maxWidth: 620 }}>
                {(d.note || "—").toString()}
              </div>
            </div>

            {/* PHONE */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <div style={{ display: "flex", fontSize: 18, fontWeight: 900, color: green }}>УТАС</div>
              <div style={{ display: "flex", flex: 1, height: 2, background: "#d1d5db" }} />
              <div style={{ display: "flex", color: dark, fontSize: 22, fontWeight: 900 }}>
                {d.pickup_contact_phone || "—"}
              </div>
            </div>
          </div>

          {/* FOOTER NOTE */}
          <div style={{ display: "flex", marginTop: "auto" }}>
            <div
              style={{
                width: "100%",
                borderRadius: 16,
                background: "#dfe8df",
                padding: "14px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", fontSize: 14, color: "#0b3d28", fontWeight: 700 }}>
                Дэлгэрэнгүй мэдээллийг <span style={{ display: "flex", fontWeight: 900, marginLeft: 6 }}>income</span> апп-с аваарай.
              </div>
              <div style={{ display: "flex", fontSize: 13, color: "#0b3d28", opacity: 0.85 }}>
                Income-д бүртгэлтэй жолооч нарт илүү хялбар орлого олох хүргэлтийн систем.
              </div>
            </div>
          </div>

          {/* WATERMARK */}
          <div style={{ display: "flex", marginTop: 10, justifyContent: "flex-end", color: "#94a3b8", fontSize: 12 }}>
            #{d.id}
          </div>
        </div>
      ),
      { width: 1080, height: 1080 }
    );
  } catch (e) {
    console.error("POSTER ERROR:", e);
    return new Response("Poster error", { status: 500 });
  }
}
