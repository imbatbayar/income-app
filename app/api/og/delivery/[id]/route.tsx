// app/api/og/delivery/[id]/route.tsx
import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

type ShareRow = {
  id: string;
  status: string;
  price_mnt: number | null;
  note: string | null;
  pickup_district: string | null;
  pickup_khoroo: string | null;
  dropoff_district: string | null;
  dropoff_khoroo: string | null;
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

function clamp(s: string, n: number) {
  const t = String(s || "").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + "…";
}

async function fetchShareRow(id: string): Promise<ShareRow | null> {
  const supabase = sb();

  const a = await supabase
    .from("deliveries_share")
    .select("id,status,price_mnt,note,pickup_district,pickup_khoroo,dropoff_district,dropoff_khoroo")
    .eq("id", id)
    .maybeSingle();

  if (a.data) return a.data as ShareRow;

  const b = await supabase
    .from("deliveries")
    .select("id,status,price_mnt,note,pickup_district,pickup_khoroo,dropoff_district,dropoff_khoroo")
    .eq("id", id)
    .maybeSingle();

  if (b.data) return b.data as ShareRow;

  return null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const d = await fetchShareRow(params.id);

  const from = d ? areaLine(d.pickup_district, d.pickup_khoroo) : "—";
  const to = d ? areaLine(d.dropoff_district, d.dropoff_khoroo) : "—";
  const price = d ? fmtPrice(d.price_mnt) : "—";
  const note = d?.note ? clamp(d.note, 60) : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          padding: "48px",
          background: "#F8FAFC",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            gap: "28px",
            borderRadius: "36px",
            border: "1px solid #E2E8F0",
            background: "#FFFFFF",
            padding: "36px",
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <div
                style={{
                  padding: "8px 14px",
                  borderRadius: "999px",
                  border: "1px solid #A7F3D0",
                  background: "#ECFDF5",
                  fontSize: "26px",
                  fontWeight: 800,
                  color: "#047857",
                }}
              >
                {price}
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#64748B" }}>
                INCOME · Хүргэлт
              </div>
            </div>

            <div
              style={{
                marginTop: "18px",
                fontSize: "44px",
                lineHeight: 1.1,
                fontWeight: 900,
                color: "#0F172A",
              }}
            >
              {from} <span style={{ color: "#94A3B8" }}>→</span> {to}
            </div>

            {note ? (
              <div
                style={{
                  marginTop: "18px",
                  padding: "14px 16px",
                  borderRadius: "22px",
                  border: "1px solid #A7F3D0",
                  background: "#ECFDF5",
                  fontSize: "26px",
                  fontWeight: 800,
                  color: "#064E3B",
                }}
              >
                📦 {note}
              </div>
            ) : null}

            <div style={{ marginTop: "auto", display: "flex", gap: "10px" }}>
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "16px",
                  border: "1px solid #E2E8F0",
                  background: "#F8FAFC",
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#334155",
                }}
              >
                Public preview
              </div>
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "16px",
                  border: "1px solid #E2E8F0",
                  background: "#F8FAFC",
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#334155",
                }}
              >
                #INCOME
              </div>
            </div>
          </div>

          <div
            style={{
              width: "420px",
              borderRadius: "28px",
              border: "1px solid #E2E8F0",
              background:
                "linear-gradient(180deg, #F1F5F9 0%, #FFFFFF 55%, #F8FAFC 100%)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "linear-gradient(#E2E8F055 1px, transparent 1px), linear-gradient(90deg, #E2E8F055 1px, transparent 1px)",
                backgroundSize: "36px 36px",
              }}
            />
            <svg
              width="420"
              height="420"
              viewBox="0 0 420 420"
              style={{ position: "absolute", left: 0, top: 0 }}
            >
              <path
                d="M90 310 C140 210, 220 230, 260 160 C300 90, 340 110, 340 110"
                stroke="#0F172A"
                strokeWidth="10"
                fill="none"
                strokeLinecap="round"
              />
              <circle cx="90" cy="310" r="18" fill="#10B981" />
              <circle cx="340" cy="110" r="18" fill="#F59E0B" />
            </svg>

            <div
              style={{
                position: "absolute",
                left: "20px",
                bottom: "20px",
                right: "20px",
                padding: "14px 16px",
                borderRadius: "20px",
                border: "1px solid #E2E8F0",
                background: "rgba(255,255,255,0.92)",
                fontSize: "18px",
                fontWeight: 700,
                color: "#334155",
              }}
            >
              Газрын зураг · Route preview
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
