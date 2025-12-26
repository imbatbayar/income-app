"use client";

export const dynamic = "force-dynamic";

/* ===========================
 * app/driver/page.tsx (STEP-SEARCH-2)
 *
 * ✅ Fixes:
 * - "🗑️ Хүсэлт цуцлах" -> delivery_id + driver_id-аар бүх мөрийг delete (duplicate хамгаалалт)
 *   мөн local myBids-оос delivery_id-аар бүгдийг арилгана → pending-ээс гарч OPEN руу буцна
 * - "Гарах" товч -> header-ийн баруун захад байрлуулсан (footer-оос авсан)
 *
 * ✅ Existing:
 * - OFFERS дээр 🔍 Хайх popup (local sort only)
 * - Toast msg/error -> closable (✕) + auto hide
 * - UI seller-style (no black)
 *
 * ✅ Added (NO flow change):
 * - PICKUP таб дээр (ASSIGNED + isMine үед) “🧭 Худалдагчийн хаяг руу очих” Google Maps товч
 *
 * ⛔ Map UI untouched
 * =========================== */

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ---------------- Types ----------------
type Role = "seller" | "driver";

type IncomeUser = {
  id: string;
  role: Role;
  name: string;
  phone: string;
  email: string;
};

type DeliveryStatus =
  | "OPEN"
  | "ASSIGNED"
  | "ON_ROUTE"
  | "DELIVERED"
  | "PAID"
  | "DISPUTE"
  | "CLOSED"
  | "CANCELLED";

type DeliveryRow = {
  id: string;
  seller_id: string;

  from_address: string | null;
  to_address: string | null;
  note: string | null;

  pickup_district: string | null;
  pickup_khoroo: string | null;
  dropoff_district: string | null;
  dropoff_khoroo: string | null;

  // ✅ координат (search эрэмбэлэлтэд ашиглана)
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;

  status: DeliveryStatus;
  created_at: string;

  price_mnt: number | null;
  delivery_type: string | null;

  chosen_driver_id: string | null;

  // legacy
  seller_marked_paid: boolean;
  driver_confirmed_payment: boolean;

  dispute_opened_at: string | null;
  closed_at: string | null;

  driver_hidden: boolean;
};

type BidLite = {
  id: string;
  driver_id: string;
  delivery_id: string;
  created_at: string;
};

type SellerLite = {
  id: string;
  name: string | null;
  phone: string | null;
};

// ---------------- Tabs (driver) ----------------
type DriverTabId = "OFFERS" | "PICKUP" | "IN_TRANSIT" | "DONE";

const DRIVER_TABS: { id: DriverTabId; label: string }[] = [
  { id: "OFFERS", label: "📦 Санал" },
  { id: "PICKUP", label: "📥 Ирж аваарай" },
  { id: "IN_TRANSIT", label: "📤 Хүргэлт эхэлсэн" },
  { id: "DONE", label: "🎉 Хүргэчихлээ" },
];

// legacy query support: /driver?tab=OPEN гэх мэтийг дэмжинэ
const LEGACY_TAB_MAP: Record<string, DriverTabId> = {
  OPEN: "OFFERS",
  ASSIGNED: "PICKUP",
  ON_ROUTE: "IN_TRANSIT",
  DELIVERED: "DONE",
  DONE: "DONE",
  OFFERS: "OFFERS",
  PICKUP: "PICKUP",
  IN_TRANSIT: "IN_TRANSIT",
};

function getDriverTabForStatus(status: DeliveryStatus): DriverTabId {
  switch (status) {
    case "OPEN":
      return "OFFERS";
    case "ASSIGNED":
      return "PICKUP";
    case "ON_ROUTE":
      return "IN_TRANSIT";
    case "DELIVERED":
      return "DONE";
    // legacy statuses -> DONE дээр нэгтгэнэ
    case "PAID":
    case "DISPUTE":
    case "CLOSED":
    case "CANCELLED":
    default:
      return "DONE";
  }
}

// ---------------- Helpers ----------------
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

function shorten(s: string | null, n = 120) {
  const t = String(s || "").trim();
  if (!t) return "—";
  if (t.length <= n) return t;
  return t.slice(0, n).replace(/\s+$/, "") + "…";
}

function areaLine(district?: string | null, khoroo?: string | null) {
  const dist = String(district || "").trim();
  const kh = String(khoroo || "").trim();
  if (!dist && !kh) return "";
  if (dist && kh) return `${dist} · ${kh}-р хороо`;
  return dist || (kh ? `${kh}-р хороо` : "");
}

function badge(status: DeliveryStatus) {
  switch (status) {
    case "OPEN":
      return {
        text: "Нээлттэй",
        cls: "bg-emerald-50 text-emerald-700 border-emerald-100",
      };
    case "ASSIGNED":
      return {
        text: "Танд оноосон",
        cls: "bg-sky-50 text-sky-700 border-sky-100",
      };
    case "ON_ROUTE":
      return {
        text: "Замд",
        cls: "bg-indigo-50 text-indigo-700 border-indigo-100",
      };
    case "DELIVERED":
      return {
        text: "Хүргэсэн",
        cls: "bg-amber-50 text-amber-800 border-amber-100",
      };
    case "PAID":
      return {
        text: "Төлсөн",
        cls: "bg-emerald-50 text-emerald-800 border-emerald-100",
      };
    case "DISPUTE":
      return {
        text: "Маргаан",
        cls: "bg-rose-50 text-rose-700 border-rose-100",
      };
    case "CLOSED":
      return {
        text: "Хаагдсан",
        cls: "bg-slate-50 text-slate-700 border-slate-200",
      };
    case "CANCELLED":
      return {
        text: "Цуцалсан",
        cls: "bg-rose-50 text-rose-700 border-rose-100",
      };
    default:
      return {
        text: status,
        cls: "bg-slate-50 text-slate-700 border-slate-200",
      };
  }
}

function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  // Haversine
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function isNonEmpty(s: any) {
  return String(s || "").trim().length > 0;
}

// ---------------- Next Suspense wrapper ----------------
export default function DriverPage() {
  return (
    <Suspense fallback={null}>
      <DriverPageInner />
    </Suspense>
  );
}

function DriverPageInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const [user, setUser] = useState<IncomeUser | null>(null);
  const [activeTab, setActiveTab] = useState<DriverTabId>("OFFERS");

  const [items, setItems] = useState<DeliveryRow[]>([]);
  const [myBids, setMyBids] = useState<BidLite[]>([]);

  const [sellerMap, setSellerMap] = useState<Record<string, SellerLite>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // action lock per deliveryId
  const [actLoading, setActLoading] = useState<Record<string, boolean>>({});

  // 🔍 search modal
  const [searchOpen, setSearchOpen] = useState(false);
  const [driverLoc, setDriverLoc] = useState<{ lat: number; lng: number } | null>(null);

  // local sort mode (device only)
  const [sortMode, setSortMode] = useState<"NONE" | "NEARME" | "DEST">("NONE");
  const [destDistrict, setDestDistrict] = useState("");
  const [destKhoroo, setDestKhoroo] = useState("");

  // ---------------- auth ----------------
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

  // ---------------- tab init ----------------
  useEffect(() => {
    const q = sp.get("tab");
    if (!q) return;

    const mapped = LEGACY_TAB_MAP[q] || (q as DriverTabId);
    if (mapped && DRIVER_TABS.find((t) => t.id === mapped)) setActiveTab(mapped);
  }, [sp]);

  // ---------------- data load ----------------
  useEffect(() => {
    if (!user) return;
    void fetchAll(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // msg auto-hide (not stuck)
  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 3000);
    return () => window.clearTimeout(t);
  }, [msg]);

  async function fetchSellersForMine(deliveries: DeliveryRow[], driverId: string) {
    const sellerIds = Array.from(
      new Set(
        deliveries
          .filter((d) => d.chosen_driver_id === driverId && d.status !== "OPEN")
          .map((d) => d.seller_id)
          .filter(Boolean)
      )
    );

    if (!sellerIds.length) {
      setSellerMap({});
      return;
    }

    try {
      const { data, error } = await supabase.from("users").select("id,name,phone").in("id", sellerIds);
      if (error) return;

      const map: Record<string, SellerLite> = {};
      for (const u of (data || []) as any[]) {
        map[u.id] = { id: u.id, name: u.name ?? null, phone: u.phone ?? null };
      }
      setSellerMap(map);
    } catch {}
  }

  async function fetchAll(driverId: string) {
    setLoading(true);
    setError(null);

    try {
      const { data: d1, error: e1 } = await supabase
        .from("deliveries")
        .select(
          [
            "id",
            "seller_id",
            "from_address",
            "to_address",
            "note",
            "pickup_district",
            "pickup_khoroo",
            "dropoff_district",
            "dropoff_khoroo",
            "pickup_lat",
            "pickup_lng",
            "dropoff_lat",
            "dropoff_lng",
            "status",
            "created_at",
            "price_mnt",
            "delivery_type",
            "chosen_driver_id",
            "seller_marked_paid",
            "driver_confirmed_payment",
            "dispute_opened_at",
            "closed_at",
            "driver_hidden",
          ].join(",")
        )
        .eq("driver_hidden", false)
        .order("created_at", { ascending: false });

      if (e1) throw e1;

      const { data: b1, error: e2 } = await supabase
        .from("driver_bids")
        .select("id,driver_id,delivery_id,created_at")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false });

      if (e2) throw e2;

      const deliveries = (d1 || []) as any as DeliveryRow[];

      const safeDeliveries = deliveries.map((x) => ({
        ...x,
        pickup_district: (x as any).pickup_district ?? null,
        pickup_khoroo: (x as any).pickup_khoroo ?? null,
        dropoff_district: (x as any).dropoff_district ?? null,
        dropoff_khoroo: (x as any).dropoff_khoroo ?? null,
        pickup_lat: toNum((x as any).pickup_lat),
        pickup_lng: toNum((x as any).pickup_lng),
        dropoff_lat: toNum((x as any).dropoff_lat),
        dropoff_lng: toNum((x as any).dropoff_lng),
      })) as DeliveryRow[];

      setItems(safeDeliveries);
      setMyBids((b1 || []) as BidLite[]);

      void fetchSellersForMine(safeDeliveries, driverId);
    } catch (e: any) {
      console.error(e);
      setError("Мэдээлэл ачааллахад алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  }

  // ---------------- computed ----------------
  const myBidSet = useMemo(() => {
    const s = new Set<string>();
    for (const b of myBids) s.add(b.delivery_id);
    return s;
  }, [myBids]);

  const counts = useMemo(() => {
    if (!user) return { OFFERS: 0, PICKUP: 0, IN_TRANSIT: 0, DONE: 0 };

    const OFFERS = items.filter((d) => d.status === "OPEN").length;
    const PICKUP = items.filter((d) => d.status === "ASSIGNED" && d.chosen_driver_id === user.id).length;
    const IN_TRANSIT = items.filter((d) => d.status === "ON_ROUTE" && d.chosen_driver_id === user.id).length;
    const DONE = items.filter((d) => getDriverTabForStatus(d.status) === "DONE" && d.chosen_driver_id === user.id).length;

    return { OFFERS, PICKUP, IN_TRANSIT, DONE };
  }, [items, user]);

  // OFFERS split: normal vs pending
  const offersSplit = useMemo(() => {
    const open = items.filter((d) => d.status === "OPEN");
    const normal: DeliveryRow[] = [];
    const pending: DeliveryRow[] = [];

    for (const d of open) {
      if (myBidSet.has(d.id)) pending.push(d);
      else normal.push(d);
    }

    // local sort (device only)
    const sortWithMode = (arr: DeliveryRow[]) => {
      if (sortMode === "NONE") return arr;

      if (sortMode === "NEARME" && driverLoc) {
        return [...arr].sort((a, b) => {
          const aLat = toNum(a.pickup_lat);
          const aLng = toNum(a.pickup_lng);
          const bLat = toNum(b.pickup_lat);
          const bLng = toNum(b.pickup_lng);

          const da =
            aLat != null && aLng != null ? distanceKm(driverLoc, { lat: aLat, lng: aLng }) : Number.POSITIVE_INFINITY;
          const db =
            bLat != null && bLng != null ? distanceKm(driverLoc, { lat: bLat, lng: bLng }) : Number.POSITIVE_INFINITY;

          return da - db;
        });
      }

      if (sortMode === "DEST") {
        // simplest: destDistrict / destKhoroo таарвал дээгүүр
        const dd = destDistrict.trim();
        const dk = destKhoroo.trim();

        const score = (x: DeliveryRow) => {
          let s = 0;
          if (dd && String(x.dropoff_district || "") === dd) s += 2;
          if (dk && String(x.dropoff_khoroo || "") === dk) s += 1;
          return -s; // smaller is better
        };

        return [...arr].sort((a, b) => score(a) - score(b));
      }

      return arr;
    };

    return {
      normal: sortWithMode(normal),
      pending: sortWithMode(pending),
    };
  }, [items, myBidSet, sortMode, driverLoc, destDistrict, destKhoroo]);

  const filtered = useMemo(() => {
    if (!user) return [];

    return items.filter((d) => {
      const tab = getDriverTabForStatus(d.status);

      if (activeTab === "OFFERS") return d.status === "OPEN";
      if (activeTab === "PICKUP") return tab === "PICKUP" && d.chosen_driver_id === user.id;
      if (activeTab === "IN_TRANSIT") return tab === "IN_TRANSIT" && d.chosen_driver_id === user.id;
      if (activeTab === "DONE") return tab === "DONE" && d.chosen_driver_id === user.id;

      return false;
    });
  }, [items, activeTab, user]);

  function changeTab(tab: DriverTabId) {
    setActiveTab(tab);
    router.push(`/driver?tab=${tab}`);
  }

  // ---------------- actions ----------------
  async function requestDelivery(deliveryId: string) {
    if (!user) return;
    if (actLoading[deliveryId]) return;

    // already pending? (local guard)
    if (myBidSet.has(deliveryId)) {
      setMsg("Та энэ хүргэлт дээр аль хэдийн хүсэлт илгээсэн байна.");
      return;
    }

    setActLoading((p) => ({ ...p, [deliveryId]: true }));
    setError(null);
    setMsg(null);

    try {
      const { data, error } = await supabase
        .from("driver_bids")
        .insert({ driver_id: user.id, delivery_id: deliveryId })
        .select("id,driver_id,delivery_id,created_at")
        .maybeSingle();

      if (error) {
        console.warn(error);
        setError("Хүсэлт илгээхэд алдаа гарлаа.");
      } else if (data) {
        setMyBids((prev) => [{ ...(data as any) }, ...prev]);
        setMsg("✋ Хүсэлт илгээлээ.");
      }

      void fetchAll(user.id);
    } catch (e: any) {
      console.error(e);
      setError("Хүсэлт илгээхэд алдаа гарлаа.");
    } finally {
      setActLoading((p) => ({ ...p, [deliveryId]: false }));
    }
  }

  async function cancelRequest(deliveryId: string) {
    if (!user) return;
    if (actLoading[deliveryId]) return;

    setActLoading((p) => ({ ...p, [deliveryId]: true }));
    setError(null);
    setMsg(null);

    try {
      // ✅ Duplicate хамгаалалт:
      // delivery_id + driver_id дээрх бүх хүсэлтийг устгана
      const { data: deleted, error } = await supabase
        .from("driver_bids")
        .delete()
        .eq("driver_id", user.id)
        .eq("delivery_id", deliveryId)
        .select("id");

      if (error) throw error;

      // ❗ Хэрэв 0 мөр устсан бол: ихэнхдээ driver_bids дээр DELETE policy байхгүй үед ингэдэг.
      if (!deleted || (Array.isArray(deleted) && deleted.length === 0)) {
        setError(
          "Хүсэлт цуцлагдсангүй. (driver_bids дээр DELETE policy байхгүй байж магадлалтай) Supabase → Table editor → Policies дээр DELETE зөвшөөрөл нэмээд дахин оролдоорой."
        );
        return;
      }

      // ✅ local: тухайн delivery дээрх бүх bid мөрийг арилгана
      setMyBids((prev) => prev.filter((x) => x.delivery_id !== deliveryId));

      setMsg("🗑️ Хүсэлт цуцаллаа.");
      void fetchAll(user.id);
    } catch (e: any) {
      console.error(e);
      setError("Хүсэлт цуцлахад алдаа гарлаа.");
    } finally {
      setActLoading((p) => ({ ...p, [deliveryId]: false }));
    }
  }

  async function markDelivered(deliveryId: string) {
    if (!user) return;
    if (actLoading[deliveryId]) return;

    setActLoading((p) => ({ ...p, [deliveryId]: true }));
    setError(null);
    setMsg(null);

    try {
      const { data, error: e1 } = await supabase
        .from("deliveries")
        .update({ status: "DELIVERED" })
        .eq("id", deliveryId)
        .eq("chosen_driver_id", user.id)
        .eq("status", "ON_ROUTE")
        .select("id,status")
        .maybeSingle();

      if (e1) throw e1;

      if (!data || (data as any).status !== "DELIVERED") {
        setError("Шилжилт амжилтгүй. (ON_ROUTE→DELIVERED) Дахин оролдоно уу.");
        return;
      }

      setItems((prev) => prev.map((x) => (x.id === deliveryId ? { ...x, status: "DELIVERED" as any } : x)));

      changeTab("DONE");
      setMsg("Хүргэлтийг хүргэсэн гэж тэмдэглэлээ.");
      void fetchAll(user.id);
    } catch (e: any) {
      console.error(e);
      setError("Шинэчлэхэд алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setActLoading((p) => ({ ...p, [deliveryId]: false }));
    }
  }

  // ✅ DONE дээр устгах (driver_hidden=true)
  async function hideDelivered(deliveryId: string) {
    if (!user) return;
    if (actLoading[deliveryId]) return;

    setActLoading((p) => ({ ...p, [deliveryId]: true }));
    setError(null);
    setMsg(null);

    try {
      const { data, error: e1 } = await supabase
        .from("deliveries")
        .update({ driver_hidden: true })
        .eq("id", deliveryId)
        .eq("chosen_driver_id", user.id)
        .select("id,driver_hidden")
        .maybeSingle();

      if (e1) throw e1;
      if (!data || !(data as any).driver_hidden) {
        setError("Устгах үйлдэл амжилтгүй. Дахин оролдоно уу.");
        return;
      }

      setItems((prev) => prev.filter((x) => x.id !== deliveryId));

      setMsg("Хүргэсэн хүргэлтийг устгалаа.");
      void fetchAll(user.id);
    } catch (e: any) {
      console.error(e);
      setError("Устгахад алдаа гарлаа.");
    } finally {
      setActLoading((p) => ({ ...p, [deliveryId]: false }));
    }
  }

  // ---------------- Search actions ----------------
  async function locateAndSortNearMe() {
    setError(null);
    setMsg(null);

    if (!navigator.geolocation) {
      setError("Энэ төхөөрөмж дээр байршил авах боломжгүй байна.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setDriverLoc({ lat, lng });
        setSortMode("NEARME");
        setMsg("🚩 Ойр саналуудыг дээр гаргалаа.");
      },
      () => {
        setError("Байршил авах зөвшөөрөл өгнө үү.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function applyDestSort() {
    if (!isNonEmpty(destDistrict) && !isNonEmpty(destKhoroo)) {
      setError("🚦 Очих газар: дүүрэг эсвэл хороо сонгоно уу.");
      return;
    }
    setSortMode("DEST");
    setSearchOpen(false);
    setMsg("🚦 Очих газраар эрэмбэллээ.");
  }

  function clearSort() {
    setSortMode("NONE");
    setDestDistrict("");
    setDestKhoroo("");
    setMsg("Эрэмбэлэлт цэвэрлэгдлээ.");
  }

  // ---------------- UI ----------------
  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6">
        
        {/* tabs (seller-like summary cards) */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {DRIVER_TABS.map((t) => {
            const active = activeTab === t.id;
            const c =
              t.id === "OFFERS"
                ? counts.OFFERS
                : t.id === "PICKUP"
                ? counts.PICKUP
                : t.id === "IN_TRANSIT"
                ? counts.IN_TRANSIT
                : counts.DONE;

            return (
              <button
                key={t.id}
                onClick={() => changeTab(t.id)}
                className={
                  active
                    ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex flex-col items-center text-center"
                    : "rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-col items-center text-center hover:border-slate-300"
                }
              >
                <div
                  className={
                    active ? "text-xs text-emerald-800 font-semibold" : "text-xs text-slate-600 font-semibold"
                  }
                >
                  {t.label}
                </div>
                <div
                  className={
                    active
                      ? "mt-1 text-lg font-extrabold text-emerald-900"
                      : "mt-1 text-lg font-extrabold text-slate-900"
                  }
                >
                  {c}
                </div>
              </button>
            );
          })}
        </div>

        {/* status line */}
        <div className="mt-4 space-y-2">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">{error}</div>
                <button
                  onClick={() => setError(null)}
                  className="shrink-0 rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-bold text-rose-700 hover:border-rose-300"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {msg && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">{msg}</div>
                <button
                  onClick={() => setMsg(null)}
                  className="shrink-0 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-xs font-bold text-emerald-800 hover:border-emerald-300"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {activeTab === "DONE" && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
              🎉 “Хүргэчихлээ” таб дээр дараагийн алхамд <span className="font-semibold">локал төлбөрийн статус</span>{" "}
              (Төлбөр хүлээж байна / Төлбөр авсан) нэмнэ. Одоохондоо “Устгах” нь зөвхөн танд харагдахгүй болгоно.
            </div>
          )}
        </div>

        {/* list */}
        <div className="mt-4">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Ачаалж байна…</div>
          ) : activeTab === "OFFERS" ? (
            <>
              {/* 🔍 Search */}
              <div className="mb-3 flex items-center justify-end gap-2">
                {sortMode !== "NONE" && (
                  <button
                    onClick={clearSort}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300"
                    title="Эрэмбэлэлт цэвэрлэх"
                  >
                    ✨ Цэвэрлэх
                  </button>
                )}

                <button
                  onClick={() => setSearchOpen(true)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-slate-300"
                >
                  🔍 Хайх
                </button>
              </div>

              {offersSplit.normal.length === 0 && offersSplit.pending.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
                  Энэ таб дээр хүргэлт алга.
                </div>
              ) : (
                <>
                  {offersSplit.normal.length > 0 && (
                    <div className="grid grid-cols-1 gap-3">
                      {offersSplit.normal.map((d) => (
                        <OfferCard
                          key={d.id}
                          d={d}
                          user={user}
                          sellerMap={sellerMap}
                          activeTab={activeTab}
                          actLoading={actLoading}
                          onRequest={requestDelivery}
                          onCancel={cancelRequest}
                          onMarkDelivered={markDelivered}
                          onHide={hideDelivered}
                          router={router}
                        />
                      ))}
                    </div>
                  )}

                  {offersSplit.pending.length > 0 && (
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-500 mb-3">💤 Хүсэлт илгээсэн — сонголт хүлээж байна</div>
                      <div className="grid grid-cols-1 gap-3">
                        {offersSplit.pending.map((d) => (
                          <OfferCard
                            key={d.id}
                            d={d}
                            user={user}
                            sellerMap={sellerMap}
                            activeTab={activeTab}
                            actLoading={actLoading}
                            onRequest={requestDelivery}
                            onCancel={cancelRequest}
                            onMarkDelivered={markDelivered}
                            onHide={hideDelivered}
                            router={router}
                            isPending
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              Энэ tab дээр хүргэлт алга.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filtered.map((d) => (
                <OfferCard
                  key={d.id}
                  d={d}
                  user={user}
                  sellerMap={sellerMap}
                  activeTab={activeTab}
                  actLoading={actLoading}
                  onRequest={requestDelivery}
                  onCancel={cancelRequest}
                  onMarkDelivered={markDelivered}
                  onHide={hideDelivered}
                  router={router}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-10 text-xs text-slate-500">INCOME · Driver</div>
      </div>

      {/* 🔍 Search Modal (Poster popup style) */}
      {searchOpen && (
        <div className="fixed inset-0 z-9999">
          <div className="absolute inset-0 bg-black/50 z-0" onClick={() => setSearchOpen(false)} aria-hidden="true" />

          <div className="absolute inset-0 z-10 flex items-center justify-center p-4 sm:p-6">
            <div className="w-full max-w-[760px]">
              <div
                className="rounded-[26px] bg-white shadow-2xl overflow-hidden"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="px-5 pt-5 pb-4"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(11,143,90,0.12) 0%, rgba(11,143,90,0.00) 70%)",
                  }}
                >
                  <div className="min-w-0">
                    <div className="text-[15px] font-extrabold tracking-tight text-slate-900">🔍 Санал хайх</div>
                    <div className="mt-1 text-[12px] font-semibold text-slate-600">
                      Та өөрт ойр байгаа хүргэлтүүдийг энэ хэсгээс хайгаарай. Тантай хамгийн ойр хүргэлтийн санал болон явах чиглэлд чинь хамгийн ойр байгаагаар нь эрэмблэн дээр гаргана.
                    </div>
                  </div>
                </div>

                <div className="px-5 pt-4 pb-5">
                  {/* 🚩 Near me */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-extrabold text-slate-900">🚩 Энд байна</div>
                    <div className="mt-1 text-xs font-semibold text-slate-600">
                      Таны байгаа байршлыг тогтоож, хамгийн ойрхон хүргэлтийн саналуудыг дээр гаргана. (Pickup координаттай
                      байвал ажиллана.)
                    </div>

                    <button
                      type="button"
                      onClick={locateAndSortNearMe}
                      className="mt-3 w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-extrabold text-emerald-900 hover:bg-emerald-100"
                    >
                      🚩 Байршил тогтоох & Эрэмбэлэх
                    </button>

                    {driverLoc && (
                      <div className="mt-2 text-[12px] font-semibold text-slate-500">
                        Одоогийн байршил: {driverLoc.lat.toFixed(5)}, {driverLoc.lng.toFixed(5)}
                      </div>
                    )}
                  </div>

                  {/* 🚦 Destination */}
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-extrabold text-slate-900">🚦 Очих газар</div>
                    <div className="mt-1 text-xs font-semibold text-slate-600">
                      Очих дүүрэг/хороо сонгож эрэмбэлнэ. (Энгийн ойролцоолол)
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-semibold text-slate-600">Дүүрэг</div>
                        <input
                          value={destDistrict}
                          onChange={(e) => setDestDistrict(e.target.value)}
                          placeholder="Ж: Баянзүрх"
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                      </div>

                      <div>
                        <div className="text-xs font-semibold text-slate-600">Хороо</div>
                        <input
                          value={destKhoroo}
                          onChange={(e) => setDestKhoroo(e.target.value)}
                          placeholder="Ж: 14"
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={applyDestSort}
                      className="mt-3 w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-extrabold text-emerald-900 hover:bg-emerald-100"
                    >
                      🚦 Очих газраар эрэмбэлэх
                    </button>

                    <button
                      type="button"
                      onClick={() => setSearchOpen(false)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 hover:border-slate-300"
                    >
                      Хаах
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OfferCard(props: {
  d: DeliveryRow;
  user: IncomeUser;
  sellerMap: Record<string, SellerLite>;
  activeTab: DriverTabId;
  actLoading: Record<string, boolean>;
  onRequest: (id: string) => void;
  onCancel: (id: string) => void;
  onMarkDelivered: (id: string) => void;
  onHide: (id: string) => void;
  router: any;
  isPending?: boolean;
}) {
  const { d, user, sellerMap, activeTab, actLoading, onRequest, onCancel, onMarkDelivered, onHide, router, isPending } =
    props;

  const b = badge(d.status);
  const isMine = d.chosen_driver_id === user.id;
  const seller = isMine ? sellerMap[d.seller_id] : undefined;

  const fromArea = areaLine(d.pickup_district, d.pickup_khoroo);
  const toArea = areaLine(d.dropoff_district, d.dropoff_khoroo);

  const bidCount = d.status === "OPEN" ? (isPending ? 1 : 0) : 0;

  const cardBase =
    "rounded-2xl border p-4 " + (isPending ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white");

  // ✅ Google Maps URL helpers (local only)
  const mapsDirUrl = (lat: number, lng: number) =>
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  const mapsSearchUrl = (q: string) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

  const pickupNavUrl =
    d.pickup_lat != null && d.pickup_lng != null
      ? mapsDirUrl(d.pickup_lat, d.pickup_lng)
      : d.from_address
      ? mapsSearchUrl(d.from_address)
      : null;

  return (
    <div className={cardBase}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${b.cls}`}>
            {b.text}
          </span>

          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
            Санал: {bidCount}
          </span>

          <span className="text-[11px] text-slate-500">{fmtDT(d.created_at)}</span>
        </div>

        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50/70 px-3 py-1 text-xs font-extrabold text-emerald-800">
          {fmtPrice(d.price_mnt)}
        </span>
      </div>

      <div className="mt-2 text-sm font-semibold text-slate-900">
        {(fromArea || "—")} <span className="text-slate-400">→</span> {(toArea || "—")}
      </div>

      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2">
        <div className={"text-sm font-semibold " + (isPending ? "text-slate-700" : "text-slate-900")}>
          {shorten(d.note, 120)}
        </div>
      </div>

      {isMine && d.status !== "OPEN" && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[11px] text-slate-500">Худалдагч</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-slate-800">{seller?.name || "—"}</div>
            {seller?.phone ? (
              <>
                <div className="text-sm text-slate-600">{seller.phone}</div>
                <a
                  href={`tel:${seller.phone}`}
                  className="ml-auto rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
                >
                  Залгах
                </a>
              </>
            ) : (
              <div className="text-sm text-slate-500">Утас: —</div>
            )}
          </div>
        </div>
      )}

      {/* ✅ STEP 3-д шаардлагатай нэмэлт: PICKUP таб дээр л pickup address + navigation */}
      {activeTab === "PICKUP" && d.status === "ASSIGNED" && isMine && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[11px] text-slate-500">ОЧИЖ АВАХ (ХУДАЛДАГЧ)</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{d.from_address || "—"}</div>

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

      <div className="mt-4 flex items-center justify-end gap-2">
        {activeTab === "OFFERS" && d.status === "OPEN" && !isPending && (
          <button
            onClick={() => onRequest(d.id)}
            disabled={!!actLoading[d.id]}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
          >
            {actLoading[d.id] ? "Илгээж байна…" : "✋ Авъя"}
          </button>
        )}

        {activeTab === "OFFERS" && d.status === "OPEN" && isPending && (
          <button
            onClick={() => onCancel(d.id)}
            disabled={!!actLoading[d.id]}
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
          >
            {actLoading[d.id] ? "Түр хүлээнэ үү…" : "🗑️ Хүсэлт цуцлах"}
          </button>
        )}

        {activeTab === "IN_TRANSIT" && d.status === "ON_ROUTE" && isMine && (
          <button
            onClick={() => onMarkDelivered(d.id)}
            disabled={!!actLoading[d.id]}
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
          >
            {actLoading[d.id] ? "Түр хүлээнэ үү…" : "🎉 Хүргэчихлээ"}
          </button>
        )}

        {activeTab === "DONE" && isMine && (
          <button
            onClick={() => onHide(d.id)}
            disabled={!!actLoading[d.id]}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-slate-300 disabled:opacity-60"
          >
            {actLoading[d.id] ? "Түр хүлээнэ үү…" : "🗑️ Устгах"}
          </button>
        )}

        <button
          onClick={() => router.push(`/driver/delivery/${d.id}?tab=${activeTab}`)}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-slate-300"
        >
          📂 Open
        </button>
      </div>
    </div>
  );
}
