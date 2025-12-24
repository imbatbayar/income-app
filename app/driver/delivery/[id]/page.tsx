"use client";

/* ===========================
 * app/driver/delivery/[id]/page.tsx
 * FIX: OPEN дээр хаяг/газрын зураг ил гарахгүй.
 *
 * ✅ OPEN үед:
 *  - зөвхөн дүүрэг/хороо + note
 *  - ✋ Авъя / 🗑️ Хүсэлт цуцлах
 *  - Хаяг, map = HIDE
 *
 * ✅ ASSIGNED (зөвхөн минийх) үед:
 *  - Худалдагчийн хаяг (pickup) тод
 *  - Google Maps нээх товч
 *  - Map preview (зөвхөн pickup point)
 * =========================== */

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DeliveryStatus, getDriverTabForStatus } from "@/lib/deliveryLogic";
import DeliveryRouteMap from "@/app/components/Map/DeliveryRouteMap";

type Role = "seller" | "driver";

type IncomeUser = {
  id: string;
  role: Role;
  name: string;
  phone: string;
  email: string;
};

type DeliveryDetail = {
  id: string;
  seller_id: string;

  from_address: string | null;
  to_address: string | null;
  note: string | null;

  pickup_district: string | null;
  pickup_khoroo: string | null;
  dropoff_district: string | null;
  dropoff_khoroo: string | null;

  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;

  status: DeliveryStatus;
  created_at: string;
  price_mnt: number | null;
  delivery_type: string | null;

  chosen_driver_id: string | null;
};

type BidLite = {
  id: string;
  driver_id: string;
  delivery_id: string;
  created_at: string;
};

// ---------------- helpers ----------------

function fmtPrice(n: number | null | undefined) {
  const v = Number(n || 0);
  return v ? `${v.toLocaleString("mn-MN")}₮` : "Үнэ тохиролцоно";
}

function fmtDT(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("mn-MN", { hour12: false });
  } catch {
    return String(iso);
  }
}

function shorten(s: string | null, max = 120) {
  if (!s) return "—";
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+$/, "") + "…";
}

function areaLine(district?: string | null, khoroo?: string | null) {
  const d = (district || "").trim();
  const k = (khoroo || "").trim();
  if (d && k) return `${d} ${k} хороо`;
  if (d) return d;
  if (k) return `${k} хороо`;
  return "—";
}

function badge(status: DeliveryStatus) {
  switch (status) {
    case "OPEN":
      return { text: "Нээлттэй", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" };
    case "ASSIGNED":
      return { text: "Танд оноосон", cls: "bg-sky-50 text-sky-700 border-sky-100" };
    case "ON_ROUTE":
      return { text: "Замд", cls: "bg-indigo-50 text-indigo-700 border-indigo-100" };
    case "DELIVERED":
      return { text: "Хүргэсэн", cls: "bg-amber-50 text-amber-800 border-amber-100" };
    default:
      return { text: status, cls: "bg-slate-50 text-slate-700 border-slate-200" };
  }
}

function mapsDirUrl(lat: number, lng: number) {
  // origin = current location (утаснаас)
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}
function mapsSearchUrl(q: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function pickErr(e: any, fallback: string) {
  const msg = e?.message || e?.error_description || e?.details;
  return msg ? `${fallback} (${String(msg)})` : fallback;
}

// ---------------- page ----------------

export default function DriverDeliveryDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();

  const id = params?.id;
  const backTab = sp.get("tab");

  const [user, setUser] = useState<IncomeUser | null>(null);
  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);
  const [myBid, setMyBid] = useState<BidLite | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [bidLoading, setBidLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  // auto-dismiss (8s)
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 8000);
    return () => clearTimeout(t);
  }, [msg]);

  // auth
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("incomeUser");
      if (!raw) return router.replace("/");
      const u: IncomeUser = JSON.parse(raw);
      if (u.role !== "driver") return router.replace("/");
      setUser(u);
    } catch {
      router.replace("/");
    }
  }, [router]);

  // fetch
  useEffect(() => {
    if (!user || !id) return;
    void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    setMsg(null);

    try {
      const { data, error: e1 } = await supabase
        .from("deliveries")
        .select(
          `
          id,
          seller_id,
          from_address,
          to_address,
          note,
          pickup_district,
          pickup_khoroo,
          dropoff_district,
          dropoff_khoroo,
          pickup_lat,
          pickup_lng,
          dropoff_lat,
          dropoff_lng,
          status,
          created_at,
          price_mnt,
          delivery_type,
          chosen_driver_id
        `
        )
        .eq("id", id)
        .maybeSingle();

      if (e1 || !data) {
        setDelivery(null);
        setError("Хүргэлтийн мэдээлэл олдсонгүй.");
        return;
      }

      const d: DeliveryDetail = {
        id: (data as any).id,
        seller_id: (data as any).seller_id,

        from_address: (data as any).from_address ?? null,
        to_address: (data as any).to_address ?? null,
        note: (data as any).note ?? null,

        pickup_district: (data as any).pickup_district ?? null,
        pickup_khoroo: (data as any).pickup_khoroo ?? null,
        dropoff_district: (data as any).dropoff_district ?? null,
        dropoff_khoroo: (data as any).dropoff_khoroo ?? null,

        pickup_lat: (data as any).pickup_lat ?? null,
        pickup_lng: (data as any).pickup_lng ?? null,
        dropoff_lat: (data as any).dropoff_lat ?? null,
        dropoff_lng: (data as any).dropoff_lng ?? null,

        status: (data as any).status as DeliveryStatus,
        created_at: (data as any).created_at,
        price_mnt: (data as any).price_mnt ?? null,
        delivery_type: (data as any).delivery_type ?? null,

        chosen_driver_id: (data as any).chosen_driver_id ?? null,
      };

      setDelivery(d);

      // my bid (latest)
      const { data: b, error: e2 } = await supabase
        .from("driver_bids")
        .select("id, driver_id, delivery_id, created_at")
        .eq("delivery_id", d.id)
        .eq("driver_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (e2) setMyBid(null);
      else setMyBid((b as any) || null);
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    if (backTab) return router.push(`/driver?tab=${encodeURIComponent(backTab)}`);
    if (!delivery) return router.push("/driver?tab=OFFERS");
    return router.push(`/driver?tab=${getDriverTabForStatus(delivery.status)}`);
  }

  const b = delivery ? badge(delivery.status) : null;

  const fromArea = delivery ? areaLine(delivery.pickup_district, delivery.pickup_khoroo) : "—";
  const toArea = delivery ? areaLine(delivery.dropoff_district, delivery.dropoff_khoroo) : "—";

  const isPending = useMemo(() => {
    if (!delivery) return false;
    return delivery.status === "OPEN" && !!myBid;
  }, [delivery, myBid]);

  const canBid = useMemo(() => delivery?.status === "OPEN", [delivery]);

  const isMine = !!delivery && !!user && delivery.chosen_driver_id === user.id;

  // ✅ OPEN үед: private info = HIDE
  const allowPrivate = delivery ? delivery.status !== "OPEN" && isMine : false;

  const pickup = useMemo(() => {
    if (!delivery) return null;
    if (delivery.pickup_lat == null || delivery.pickup_lng == null) return null;
    return { lat: delivery.pickup_lat, lng: delivery.pickup_lng };
  }, [delivery]);

  const dropoff = useMemo(() => {
    if (!delivery) return null;
    if (delivery.dropoff_lat == null || delivery.dropoff_lng == null) return null;
    return { lat: delivery.dropoff_lat, lng: delivery.dropoff_lng };
  }, [delivery]);

  // Google Maps link (pickup)
  const pickupNavUrl = useMemo(() => {
    if (!delivery) return null;
    if (delivery.pickup_lat != null && delivery.pickup_lng != null) return mapsDirUrl(delivery.pickup_lat, delivery.pickup_lng);
    if (delivery.from_address) return mapsSearchUrl(delivery.from_address);
    return null;
  }, [delivery]);

  async function placeBid() {
    if (!delivery || !user) return;
    if (!canBid) return setError("Зөвхөн Нээлттэй үед хүсэлт илгээнэ.");
    if (myBid) return setError("Та аль хэдийн хүсэлт илгээсэн байна.");
    if (bidLoading) return;

    setBidLoading(true);
    setError(null);
    setMsg(null);

    try {
      const { data, error } = await supabase
        .from("driver_bids")
        .insert({ delivery_id: delivery.id, driver_id: user.id })
        .select("id, driver_id, delivery_id, created_at")
        .maybeSingle();

      if (error) {
        console.error(error);
        setError(pickErr(error, "Хүсэлт илгээхэд алдаа гарлаа."));
        return;
      }

      setMyBid((data as any) || null);
      setMsg("Хүсэлт илгээлээ.");
    } finally {
      setBidLoading(false);
    }
  }

  async function cancelBid() {
    if (!delivery || !user) return;
    if (!canBid) return setError("Энэ төлөв дээр хүсэлт цуцлах боломжгүй.");
    if (!myBid) return setError("Та хүсэлт илгээгүй байна.");
    if (cancelLoading) return;

    setCancelLoading(true);
    setError(null);
    setMsg(null);

    try {
      const { error } = await supabase
        .from("driver_bids")
        .delete()
        .eq("delivery_id", delivery.id)
        .eq("driver_id", user.id);

      if (error) {
        console.error(error);
        setError(pickErr(error, "Хүсэлт цуцлахад алдаа гарлаа."));
        return;
      }

      setMyBid(null);
      setMsg("Хүсэлт цуцлагдлаа.");
    } finally {
      setCancelLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          <div className="h-10 w-32 rounded-xl bg-slate-200 animate-pulse" />
          <div className="h-32 rounded-2xl border border-slate-200 bg-white animate-pulse" />
          <div className="h-64 rounded-2xl border border-slate-200 bg-white animate-pulse" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={goBack}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            ← Буцах
          </button>
        </div>

        {error && (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <div className="pr-2">{error}</div>
            <button onClick={() => setError(null)} className="rounded-lg px-2 py-0.5 hover:bg-red-100" aria-label="close">
              ✕
            </button>
          </div>
        )}

        {msg && (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <div className="pr-2">{msg}</div>
            <button onClick={() => setMsg(null)} className="rounded-lg px-2 py-0.5 hover:bg-emerald-100" aria-label="close">
              ✕
            </button>
          </div>
        )}

        {!delivery ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6">
            <p className="text-sm text-slate-700">Хүргэлтийн мэдээлэл олдсонгүй.</p>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50/70 px-3 py-1 text-xs font-extrabold text-emerald-800">
                      {fmtPrice(delivery.price_mnt)}
                    </span>

                    {b && (
                      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${b.cls}`}>
                        {b.text}
                      </span>
                    )}

                    <span className="text-xs text-slate-500">{fmtDT(delivery.created_at)}</span>
                  </div>

                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {fromArea} <span className="text-slate-400">→</span> {toArea}
                  </div>

                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2">
                    <div className="text-sm font-semibold text-slate-900">{shorten(delivery.note, 140)}</div>
                  </div>

                  {/* ✅ OPEN үед: “Дэлгэрэнгүй нь PICKUP дээр” */}
                  {delivery.status === "OPEN" && (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-xs leading-relaxed text-slate-700">
                        ℹ️ Худалдагч таныг сонговол дэлгэрэнгүй хаяг болон навигац{" "}
                        <span className="font-semibold">📥 Ирж аваарай</span> таб дээр гарна.
                      </div>
                    </div>
                  )}

                  {/* ✅ OPEN actions */}
                  {delivery.status === "OPEN" && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {!isPending ? (
                        <button
                          type="button"
                          onClick={() => void placeBid()}
                          disabled={bidLoading}
                          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          {bidLoading ? "Түр хүлээнэ үү…" : "✋ Авъя"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void cancelBid()}
                          disabled={cancelLoading}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                        >
                          {cancelLoading ? "Түр хүлээнэ үү…" : "🗑️ Хүсэлт цуцлах"}
                        </button>
                      )}

                      {isPending && <span className="text-xs text-slate-500">💤 Хүсэлт илгээсэн — сонголт хүлээж байна</span>}
                    </div>
                  )}

                  {/* ✅ ASSIGNED минийх бол: pickup address + nav */}
                  {allowPrivate && delivery.status === "ASSIGNED" && (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="text-[11px] text-slate-500">ОЧИЖ АВАХ (ХУДАЛДАГЧ)</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">{delivery.from_address || "—"}</div>

                      <div className="mt-2 text-[11px] text-slate-500">
                        ⚠️ Таны утсанд Google Maps апп суусан байх ёстой. (Суусан бол шууд навигац нээгдэнэ.)
                      </div>

                      {pickupNavUrl ? (
                        <a
                          href={pickupNavUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-extrabold text-emerald-900 hover:bg-emerald-100"
                        >
                          🧭 Худалдагчийн хаяг руу очих
                        </a>
                      ) : (
                        <div className="mt-3 text-xs text-slate-500">Байршлын мэдээлэл олдсонгүй.</div>
                      )}
                    </div>
                  )}

                  {/* ✅ бусдынх бол private hide */}
                  {delivery.status !== "OPEN" && !isMine && (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-xs text-slate-700">ℹ️ Энэ хүргэлт аль хэдийн сонгогдсон байна.</div>
                    </div>
                  )}
                </div>

                <div className="hidden sm:block text-right">
                  <div className="text-[11px] text-slate-500">ID</div>
                  <div className="font-mono text-xs text-slate-700">{delivery.id.slice(0, 8)}</div>
                </div>
              </div>
            </section>

            {/* ✅ Map: OPEN үед HIDE. Зөвхөн минийх дээр (private) харуулна */}
            {allowPrivate && pickup ? (
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="text-sm font-semibold text-slate-900">Газрын зураг</div>
                  <div className="mt-0.5 text-xs text-slate-500">Очиж авах байршил</div>
                </div>

                {/* ASSIGNED үед зөвхөн pickup point харуулна */}
                <DeliveryRouteMap pickup={pickup} dropoff={delivery.status === "ON_ROUTE" ? dropoff : null} aspectRatio="16 / 9" />
              </section>
            ) : (
              <section className="rounded-2xl border border-slate-200 bg-white px-4 py-6">
                <div className="text-sm font-semibold text-slate-900">Газрын зураг</div>
                <div className="mt-1 text-sm text-slate-600">
                  {delivery?.status === "OPEN"
                    ? "Худалдагч таныг сонгосны дараа газрын зураг харагдана."
                    : "Координатын мэдээлэл олдсонгүй."}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
