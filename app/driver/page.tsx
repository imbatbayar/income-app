"use client";

/* ===========================
 * app/driver/page.tsx (FINAL)
 *
 * ✅ OPEN: карт дээрээс "Авах хүсэлт" (driver_bids insert) / "Хүсэлт цуцлах" (delete)
 * ✅ ASSIGNED: "Замд гарсан" -> ON_ROUTE
 * ✅ ON_ROUTE: "Хүргэлсэн" -> DELIVERED
 * ✅ DELIVERED: "Төлбөр авснаа батлах" -> driver_confirmed_payment toggle
 *    Хэрэв seller_marked_paid=true бол CLOSED болно (shouldCloseDelivery)
 * ✅ Маргаан: ON_ROUTE / DELIVERED үед (canOpenDisputeForDriver)
 *
 * ❌ Жолооч үнэлэх/одуулах UI энд байхгүй
 * =========================== */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  DeliveryStatus,
  DRIVER_TABS,
  DriverTabId,
  canOpenDisputeForDriver,
  shouldCloseDelivery,
} from "@/lib/deliveryLogic";

type Role = "seller" | "driver";

type IncomeUser = {
  id: string;
  role: Role;
  name: string;
  phone: string;
  email: string;
};

type DeliveryRow = {
  id: string;
  seller_id: string;
  from_address: string | null;
  to_address: string | null;
  note: string | null;
  status: DeliveryStatus;
  created_at: string;
  price_mnt: number | null;
  delivery_type: string | null;

  chosen_driver_id: string | null;

  seller_marked_paid: boolean;
  driver_confirmed_payment: boolean;
  closed_at: string | null;

  dispute_reason: string | null;
  dispute_opened_at: string | null;

  seller_hidden: boolean;

  // dashboard-only
  has_bid?: boolean;
};

const TAB_IDS: DriverTabId[] = DRIVER_TABS.map((t) => t.id);

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
    return iso;
  }
}

function shorten(s: string | null, max = 110) {
  if (!s) return "";
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+$/, "") + "…";
}

function typeLabel(deliveryType: string | null): { icon: string; label: string } {
  switch (deliveryType) {
    case "apartment":
      return { icon: "🏙", label: "Байр" };
    case "ger":
      return { icon: "🏠", label: "Гэр хороолол" };
    case "camp":
      return { icon: "🏕", label: "Лагер" };
    case "countryside":
      return { icon: "🚌", label: "Орон нутаг" };
    default:
      return { icon: "📦", label: "Хүргэлт" };
  }
}

function badge(status: DeliveryStatus) {
  switch (status) {
    case "OPEN":
      return { text: "Нээлттэй", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" };
    case "ASSIGNED":
      return { text: "Намайг сонгосон", cls: "bg-sky-50 text-sky-700 border-sky-100" };
    case "ON_ROUTE":
      return { text: "Замд", cls: "bg-indigo-50 text-indigo-700 border-indigo-100" };
    case "DELIVERED":
      return { text: "Хүргэсэн", cls: "bg-amber-50 text-amber-700 border-amber-100" };
    case "DISPUTE":
      return { text: "Маргаан", cls: "bg-rose-50 text-rose-700 border-rose-100" };
    case "CLOSED":
      return { text: "Хаагдсан", cls: "bg-slate-50 text-slate-700 border-slate-200" };
    case "CANCELLED":
      return { text: "Цуцалсан", cls: "bg-rose-50 text-rose-700 border-rose-100" };
    default:
      return { text: status, cls: "bg-slate-50 text-slate-700 border-slate-200" };
  }
}

function filterByTab(tab: DriverTabId, items: DeliveryRow[], driverId: string) {
  return items.filter((d) => {
    // OPEN таб: зөвхөн OPEN
    if (tab === "OPEN") return d.status === "OPEN";

    // бусад табууд: зөвхөн өөрт оноогдсон хүргэлтүүд
    const isMine = d.chosen_driver_id === driverId;

    switch (tab) {
      case "ASSIGNED":
        return isMine && d.status === "ASSIGNED";
      case "ON_ROUTE":
        return isMine && d.status === "ON_ROUTE";
      case "DELIVERED":
        return isMine && d.status === "DELIVERED";
      case "DISPUTE":
        return isMine && d.status === "DISPUTE";
      case "CLOSED":
        return isMine && (d.status === "CLOSED" || d.status === "CANCELLED");
      default:
        return false;
    }
  });
}

// ---------------- page ----------------

export default function DriverDashboardPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [user, setUser] = useState<IncomeUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [activeTab, setActiveTab] = useState<DriverTabId>("OPEN");

  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // per-delivery loading flags
  const [actLoading, setActLoading] = useState<Record<string, boolean>>({});

  // dispute modal
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeDeliveryId, setDisputeDeliveryId] = useState<string | null>(null);

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
    } finally {
      setLoadingUser(false);
    }
  }, [router]);

  // ---------------- tab init ----------------
  useEffect(() => {
    const urlTab = sp.get("tab");
    if (urlTab && TAB_IDS.includes(urlTab as DriverTabId)) {
      setActiveTab(urlTab as DriverTabId);
      localStorage.setItem("driverActiveTab", urlTab);
      return;
    }
    const stored = localStorage.getItem("driverActiveTab");
    if (stored && TAB_IDS.includes(stored as DriverTabId)) {
      setActiveTab(stored as DriverTabId);
    }
  }, [sp]);

  function changeTab(tab: DriverTabId) {
    setActiveTab(tab);
    localStorage.setItem("driverActiveTab", tab);
    router.push(`/driver?tab=${tab}`);
  }

  // ---------------- fetch ----------------
  useEffect(() => {
    if (!user) return;
    void fetchDeliveries(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // focus refresh
  useEffect(() => {
    if (!user) return;
    const onFocus = () => void fetchDeliveries(user.id);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function fetchDeliveries(driverId: string) {
    setLoading(true);
    setError(null);

    try {
      // 1) OPEN deliveries (seller_hidden=false)
      const { data: openData, error: e1 } = await supabase
        .from("deliveries")
        .select(
          `
          id,
          seller_id,
          from_address,
          to_address,
          note,
          status,
          created_at,
          price_mnt,
          delivery_type,
          chosen_driver_id,
          seller_marked_paid,
          driver_confirmed_payment,
          closed_at,
          dispute_reason,
          dispute_opened_at,
          seller_hidden
        `
        )
        .eq("status", "OPEN")
        .eq("seller_hidden", false)
        .order("created_at", { ascending: false });

      if (e1) throw e1;

      // 2) My assigned deliveries
      const { data: mineData, error: e2 } = await supabase
        .from("deliveries")
        .select(
          `
          id,
          seller_id,
          from_address,
          to_address,
          note,
          status,
          created_at,
          price_mnt,
          delivery_type,
          chosen_driver_id,
          seller_marked_paid,
          driver_confirmed_payment,
          closed_at,
          dispute_reason,
          dispute_opened_at,
          seller_hidden
        `
        )
        .eq("chosen_driver_id", driverId)
        .eq("seller_hidden", false)
        .order("created_at", { ascending: false });

      if (e2) throw e2;

      // merge map
      const map = new Map<string, DeliveryRow>();

      function normalize(d: any): DeliveryRow {
        return {
          id: d.id,
          seller_id: d.seller_id,
          from_address: d.from_address,
          to_address: d.to_address,
          note: d.note,
          status: d.status as DeliveryStatus,
          created_at: d.created_at,
          price_mnt: d.price_mnt,
          delivery_type: d.delivery_type,
          chosen_driver_id: d.chosen_driver_id,
          seller_marked_paid: !!d.seller_marked_paid,
          driver_confirmed_payment: !!d.driver_confirmed_payment,
          closed_at: d.closed_at,
          dispute_reason: d.dispute_reason ?? null,
          dispute_opened_at: d.dispute_opened_at ?? null,
          seller_hidden: !!d.seller_hidden,
        };
      }

      for (const d of openData || []) map.set(d.id, normalize(d));
      for (const d of mineData || []) map.set(d.id, normalize(d));

      const merged = Array.from(map.values());

      // 3) My bids set
      const { data: bidData, error: e3 } = await supabase
        .from("driver_bids")
        .select("delivery_id")
        .eq("driver_id", driverId);

      if (e3) {
        console.error(e3);
      }

      const bidSet = new Set<string>((bidData || []).map((b: any) => String(b.delivery_id)));

      // attach has_bid
      const withBidFlag = merged.map((d) =>
        d.status === "OPEN" ? { ...d, has_bid: bidSet.has(d.id) } : d
      );

      setDeliveries(withBidFlag);
    } catch (e) {
      console.error(e);
      setDeliveries([]);
      setError("Жагсаалт татахад алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  }

  // ---------------- actions ----------------

  function setLoadingFor(id: string, val: boolean) {
    setActLoading((prev) => ({ ...prev, [id]: val }));
  }

  async function requestOpenDelivery(deliveryId: string) {
    if (!user) return;
    setError(null);
    setMsg(null);
    setLoadingFor(deliveryId, true);

    try {
      const { error } = await supabase
        .from("driver_bids")
        .insert({ delivery_id: deliveryId, driver_id: user.id });

      if (error) {
        console.error(error);
        setError("Авах хүсэлт илгээхэд алдаа гарлаа.");
        return;
      }

      setDeliveries((prev) =>
        prev.map((d) => (d.id === deliveryId ? { ...d, has_bid: true } : d))
      );
      setMsg("Авах хүсэлт илгээлээ.");
    } finally {
      setLoadingFor(deliveryId, false);
    }
  }

  async function cancelMyBid(deliveryId: string) {
    if (!user) return;
    setError(null);
    setMsg(null);
    setLoadingFor(deliveryId, true);

    try {
      const { error } = await supabase
        .from("driver_bids")
        .delete()
        .eq("delivery_id", deliveryId)
        .eq("driver_id", user.id);

      if (error) {
        console.error(error);
        setError("Хүсэлт цуцлахад алдаа гарлаа.");
        return;
      }

      setDeliveries((prev) =>
        prev.map((d) => (d.id === deliveryId ? { ...d, has_bid: false } : d))
      );
      setMsg("Хүсэлт цуцлагдлаа.");
    } finally {
      setLoadingFor(deliveryId, false);
    }
  }

  async function updateStatusMine(deliveryId: string, from: DeliveryStatus, to: DeliveryStatus) {
    if (!user) return;
    setError(null);
    setMsg(null);
    setLoadingFor(deliveryId, true);

    try {
      const { error } = await supabase
        .from("deliveries")
        .update({ status: to })
        .eq("id", deliveryId)
        .eq("chosen_driver_id", user.id)
        .eq("status", from);

      if (error) {
        console.error(error);
        setError("Статус шинэчлэхэд алдаа гарлаа.");
        return;
      }

      setDeliveries((prev) =>
        prev.map((d) => (d.id === deliveryId ? { ...d, status: to } : d))
      );

      // redirect to matching tab
      localStorage.setItem("driverActiveTab", to === "CANCELLED" || to === "CLOSED" ? "CLOSED" : (to as any));
      router.push(`/driver?tab=${to === "CANCELLED" || to === "CLOSED" ? "CLOSED" : to}`);
    } finally {
      setLoadingFor(deliveryId, false);
    }
  }

  async function toggleDriverPayment(deliveryId: string) {
    if (!user) return;
    const d = deliveries.find((x) => x.id === deliveryId);
    if (!d) return;

    if (!(d.status === "DELIVERED" || d.status === "CLOSED")) {
      setError("Зөвхөн 'Хүргэсэн' үед төлбөр батална.");
      return;
    }
    if (d.chosen_driver_id !== user.id) {
      setError("Энэ хүргэлт танд оноогдоогүй байна.");
      return;
    }

    setError(null);
    setMsg(null);
    setLoadingFor(deliveryId, true);

    try {
      const nextPaid = !d.driver_confirmed_payment;

      const willClose = shouldCloseDelivery({
        status: d.status,
        seller_marked_paid: d.seller_marked_paid,
        driver_confirmed_payment: nextPaid,
      });

      const nextStatus: DeliveryStatus = willClose ? "CLOSED" : d.status;
      const closedAt = willClose ? new Date().toISOString() : d.closed_at;

      const { error } = await supabase
        .from("deliveries")
        .update({
          driver_confirmed_payment: nextPaid,
          status: nextStatus,
          closed_at: closedAt,
        })
        .eq("id", deliveryId)
        .eq("chosen_driver_id", user.id);

      if (error) {
        console.error(error);
        setError("Төлбөр батлахад алдаа гарлаа.");
        return;
      }

      setDeliveries((prev) =>
        prev.map((x) =>
          x.id === deliveryId
            ? { ...x, driver_confirmed_payment: nextPaid, status: nextStatus, closed_at: closedAt }
            : x
        )
      );

      setMsg(nextPaid ? "Төлбөр авснаа баталлаа." : "Төлбөрийн баталгааг цуцаллаа.");

      if (nextStatus === "CLOSED") {
        localStorage.setItem("driverActiveTab", "CLOSED");
        router.push("/driver?tab=CLOSED");
      }
    } finally {
      setLoadingFor(deliveryId, false);
    }
  }

  function openDisputeModal(deliveryId: string) {
    setDisputeDeliveryId(deliveryId);
    setDisputeReason("");
    setShowDispute(true);
  }

  async function submitDispute() {
    if (!user) return;
    if (!disputeDeliveryId) return;

    const d = deliveries.find((x) => x.id === disputeDeliveryId);
    if (!d) return;

    if (d.chosen_driver_id !== user.id) {
      setError("Энэ хүргэлт танд оноогдоогүй байна.");
      return;
    }
    if (!canOpenDisputeForDriver(d.status)) {
      setError("Энэ төлөв дээр маргаан нээх боломжгүй.");
      return;
    }

    const reason = disputeReason.trim();
    if (!reason) {
      setError("Маргааны шалтгаанаа бичнэ үү.");
      return;
    }

    setError(null);
    setMsg(null);
    setLoadingFor(disputeDeliveryId, true);

    try {
      const openedAt = new Date().toISOString();

      const { error } = await supabase
        .from("deliveries")
        .update({
          status: "DISPUTE",
          dispute_reason: reason,
          dispute_opened_at: openedAt,
        })
        .eq("id", disputeDeliveryId)
        .eq("chosen_driver_id", user.id);

      if (error) {
        console.error(error);
        setError("Маргаан нээхэд алдаа гарлаа.");
        return;
      }

      setDeliveries((prev) =>
        prev.map((x) =>
          x.id === disputeDeliveryId
            ? { ...x, status: "DISPUTE", dispute_reason: reason, dispute_opened_at: openedAt }
            : x
        )
      );

      setShowDispute(false);
      setDisputeDeliveryId(null);
      setDisputeReason("");
      setMsg("Маргаан нээгдлээ.");

      localStorage.setItem("driverActiveTab", "DISPUTE");
      router.push("/driver?tab=DISPUTE");
    } finally {
      setLoadingFor(disputeDeliveryId, false);
    }
  }

  // ---------------- derived ----------------

  const filtered = useMemo(() => {
    if (!user) return [];
    return filterByTab(activeTab, deliveries, user.id);
  }, [activeTab, deliveries, user]);

  const tabCounts = useMemo(() => {
    if (!user) return {} as Record<DriverTabId, number>;
    return DRIVER_TABS.reduce((acc, t) => {
      acc[t.id] = filterByTab(t.id, deliveries, user.id).length;
      return acc;
    }, {} as Record<DriverTabId, number>);
  }, [deliveries, user]);

  const openWithoutBid = useMemo(() => {
    if (!user) return [];
    return deliveries
      .filter((d) => d.status === "OPEN" && !d.has_bid)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [deliveries, user]);

  const openWithBid = useMemo(() => {
    if (!user) return [];
    return deliveries
      .filter((d) => d.status === "OPEN" && !!d.has_bid)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [deliveries, user]);

  // ---------------- UI ----------------

  if (loadingUser || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Ачаалж байна…</div>
      </div>
    );
  }

  if (!user) return null;

  function logout() {
    localStorage.removeItem("incomeUser");
    router.replace("/");
  }

  function Card({ d, driverId }: { d: DeliveryRow; driverId: string }) {

    const t = typeLabel(d.delivery_type);
    const b = badge(d.status);

    const isMine = d.chosen_driver_id === driverId;

    const isOpen = d.status === "OPEN";
    const isAssigned = isMine && d.status === "ASSIGNED";
    const isOnRoute = isMine && d.status === "ON_ROUTE";
    const isDelivered = isMine && d.status === "DELIVERED";
    const canDispute = isMine && canOpenDisputeForDriver(d.status) && d.status !== "DISPUTE";

    return (
      <div
        className="rounded-2xl border border-slate-200 bg-white px-4 py-4 hover:bg-slate-50 transition"
      >
        <button
          onClick={() => router.push(`/driver/delivery/${d.id}?tab=${activeTab}`)}
          className="w-full text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs">{t.icon}</span>
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {t.label} #{d.id.slice(0, 6)}
                </div>
                <span className={`text-[10px] px-2 py-1 rounded-full border ${b.cls}`}>
                  {b.text}
                </span>
              </div>

              <div className="mt-2 space-y-1">
                <div className="text-[11px] text-slate-500">Үүсгэсэн: {fmtDT(d.created_at)}</div>
                <div className="text-xs text-slate-700">
                  <span className="font-semibold text-slate-600">Авах:</span>{" "}
                  {shorten(d.from_address, 80) || "—"}
                </div>
                <div className="text-xs text-slate-700">
                  <span className="font-semibold text-slate-600">Хүргэх:</span>{" "}
                  {shorten(d.to_address, 80) || "—"}
                </div>
                {d.note && <div className="text-[11px] text-slate-500">{shorten(d.note, 90)}</div>}
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-[11px] text-slate-500">Үнэ</div>
              <div className="text-sm font-semibold text-slate-900">{fmtPrice(d.price_mnt)}</div>
            </div>
          </div>
        </button>

        {/* ✅ QUICK BUTTONS (карт дээр) */}
        <div className="mt-3 flex flex-wrap gap-2">
          {/* OPEN: bid */}
          {isOpen && !d.has_bid && (
            <button
              onClick={() => void requestOpenDelivery(d.id)}
              disabled={!!actLoading[d.id]}
              className="text-[11px] px-4 py-2 rounded-full bg-emerald-600 text-white font-semibold disabled:opacity-60"
            >
              {actLoading[d.id] ? "Илгээж байна…" : "Авах хүсэлт"}
            </button>
          )}

          {isOpen && !!d.has_bid && (
            <button
              onClick={() => void cancelMyBid(d.id)}
              disabled={!!actLoading[d.id]}
              className="text-[11px] px-4 py-2 rounded-full bg-slate-900 text-white font-semibold disabled:opacity-60"
            >
              {actLoading[d.id] ? "Цуцалж байна…" : "Хүсэлт цуцлах"}
            </button>
          )}

          {/* ASSIGNED -> ON_ROUTE */}
          {isAssigned && (
            <button
              onClick={() => void updateStatusMine(d.id, "ASSIGNED", "ON_ROUTE")}
              disabled={!!actLoading[d.id]}
              className="text-[11px] px-4 py-2 rounded-full bg-indigo-600 text-white font-semibold disabled:opacity-60"
              title="ASSIGNED -> ON_ROUTE"
            >
              {actLoading[d.id] ? "Тэмдэглэж байна…" : "Замд гарсан"}
            </button>
          )}

          {/* ON_ROUTE -> DELIVERED */}
          {isOnRoute && (
            <button
              onClick={() => void updateStatusMine(d.id, "ON_ROUTE", "DELIVERED")}
              disabled={!!actLoading[d.id]}
              className="text-[11px] px-4 py-2 rounded-full bg-amber-600 text-white font-semibold disabled:opacity-60"
              title="ON_ROUTE -> DELIVERED"
            >
              {actLoading[d.id] ? "Тэмдэглэж байна…" : "Хүргэлсэн"}
            </button>
          )}

          {/* DELIVERED: confirm payment */}
          {isDelivered && (
            <button
              onClick={() => void toggleDriverPayment(d.id)}
              disabled={!!actLoading[d.id]}
              className="text-[11px] px-4 py-2 rounded-full bg-slate-900 text-white font-semibold disabled:opacity-60"
            >
              {actLoading[d.id]
                ? "Баталж байна…"
                : d.driver_confirmed_payment
                ? "Төлбөр баталгааг цуцлах"
                : "Төлбөр авснаа батлах"}
            </button>
          )}

          {/* dispute */}
          {canDispute && (
            <button
              onClick={() => openDisputeModal(d.id)}
              disabled={!!actLoading[d.id]}
              className="text-[11px] px-4 py-2 rounded-full border border-rose-300 bg-rose-50 text-rose-700 font-semibold disabled:opacity-60"
            >
              Маргаан
            </button>
          )}

          {/* detail shortcut */}
          <button
            onClick={() => router.push(`/driver/delivery/${d.id}?tab=${activeTab}`)}
            className="text-[11px] px-4 py-2 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            Дэлгэрэнгүй
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-sm font-semibold">Жолоочийн самбар</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={logout}
              className="text-[11px] px-4 py-2 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              Гарах
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {msg && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-xs">
            {msg}
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-2 text-xs">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="rounded-2xl border border-slate-200 bg-white px-2 py-2 flex flex-wrap gap-1">
          {DRIVER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => changeTab(tab.id)}
              className={
                "text-[11px] px-3 py-1.5 rounded-full border " +
                (tab.id === activeTab
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-600 border-slate-200")
              }
            >
              {tab.label}
              {tabCounts[tab.id] > 0 && <span className="ml-1">({tabCounts[tab.id]})</span>}
            </button>
          ))}
        </div>

        {/* OPEN tab special grouping */}
        {activeTab === "OPEN" ? (
          <div className="space-y-5">
            {openWithoutBid.length > 0 && (
              <div className="space-y-2">
                <p className="px-1 text-[11px] font-medium text-slate-600">Нээлттэй захиалгууд</p>
                <div className="space-y-3">
                  {openWithoutBid.map((d) => (
                    <Card key={d.id} d={d} driverId={user.id} />

                  ))}
                </div>
              </div>
            )}

            {openWithBid.length > 0 && (
              <div className="space-y-2">
                <p className="px-1 text-[11px] font-medium text-slate-600">Миний өгсөн саналууд</p>
                <div className="space-y-3">
                  {openWithBid.map((d) => (
                    <Card key={d.id} d={d} driverId={user.id} />
                  ))}
                </div>
              </div>
            )}

            {openWithoutBid.length === 0 && openWithBid.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
                Нээлттэй хүргэлт алга байна.
              </div>
            )}
          </div>
        ) : (
          <section className="space-y-3">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
                Энэ таб дээр хүргэлт алга байна.
              </div>
            ) : (
              filtered.map((d) => <Card key={d.id} d={d} driverId={user.id} />)
            )}
          </section>
        )}
      </main>

      {/* Dispute modal */}
      {showDispute && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4">
          <div className="max-w-md w-full rounded-2xl bg-white shadow-lg border border-slate-200 px-4 py-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Маргаан үүсгэх (driver)</h3>
            <p className="text-xs text-slate-600">Товч, тодорхой шалтгаанаа бичнэ үү.</p>

            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              placeholder="Юу болсон талаар…"
            />

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowDispute(false);
                  setDisputeDeliveryId(null);
                  setDisputeReason("");
                }}
                className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Болих
              </button>

              <button
                type="button"
                onClick={() => void submitDispute()}
                className="text-[11px] px-3 py-1.5 rounded-full bg-rose-600 text-white hover:bg-rose-700"
              >
                Маргаан нээх
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
