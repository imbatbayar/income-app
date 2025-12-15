"use client";

/* ===========================
 * app/seller/page.tsx (FINAL)
 *
 * ✅ Tab: SELLER_TABS (deliveryLogic.ts-тэй таарна)
 * ✅ OPEN дээр: driver_bids тоог карт дээр харуулна
 * ✅ ASSIGNED дээр: карт дээр "Хүргэлт гарсан" (ASSIGNED -> ON_ROUTE) + /seller?tab=ON_ROUTE
 * ✅ CLOSED дээр: CANCELLED хүргэлтүүдийг "Хаагдсанаас устгах" (seller_hidden=true)
 * ✅ Бүх таб дээр: карт дээр quick action + "Дэлгэрэнгүй" товч байна
 *
 * NOTE:
 * - CANCELLED нь CLOSED таб руу орно (deliveryLogic mapping)
 * - Устгах нь физик delete биш, seller_hidden=true (RLS safe)
 * =========================== */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  DeliveryStatus,
  SELLER_TABS,
  SellerTabId,
  getSellerTabForStatus,
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

  // UI-only
  bid_count?: number;
};

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

function shorten(s: string | null, max = 70) {
  if (!s) return "—";
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
      return { text: "Жолооч сонгосон", cls: "bg-sky-50 text-sky-700 border-sky-100" };
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

export default function SellerDashboardPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [user, setUser] = useState<IncomeUser | null>(null);
  const [activeTab, setActiveTab] = useState<SellerTabId>("OPEN");

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DeliveryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [actLoading, setActLoading] = useState<Record<string, boolean>>({});

  // auth
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("incomeUser");
      if (!raw) return router.replace("/");
      const u: IncomeUser = JSON.parse(raw);
      if (u.role !== "seller") return router.replace("/");
      setUser(u);
    } catch {
      router.replace("/");
    }
  }, [router]);

  // init tab
  useEffect(() => {
    const urlTab = sp.get("tab");
    const valid = SELLER_TABS.some((t) => t.id === (urlTab as any));
    if (urlTab && valid) {
      setActiveTab(urlTab as SellerTabId);
      localStorage.setItem("sellerActiveTab", urlTab);
      return;
    }
    const stored = localStorage.getItem("sellerActiveTab");
    const validStored = SELLER_TABS.some((t) => t.id === (stored as any));
    if (stored && validStored) setActiveTab(stored as SellerTabId);
  }, [sp]);

  function changeTab(tab: SellerTabId) {
    setActiveTab(tab);
    localStorage.setItem("sellerActiveTab", tab);
    router.push(`/seller?tab=${tab}`);
  }

  // fetch
  useEffect(() => {
    if (!user) return;
    void fetchAll(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const onFocus = () => void fetchAll(user.id);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function fetchAll(sellerId: string) {
    setLoading(true);
    setError(null);

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
        .eq("seller_id", sellerId)
        .eq("seller_hidden", false)
        .order("created_at", { ascending: false });

      if (e1) throw e1;

      const base: DeliveryRow[] = (data || []).map((d: any) => ({
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
      }));

      // OPEN дээр bid_count гаргахын тулд driver_bids count татна
      const openIds = base.filter((x) => x.status === "OPEN").map((x) => x.id);

      if (openIds.length > 0) {
        const { data: bids, error: e2 } = await supabase
          .from("driver_bids")
          .select("delivery_id")
          .in("delivery_id", openIds);

        if (!e2) {
          const cnt = new Map<string, number>();
          for (const b of bids || []) {
            const did = String((b as any).delivery_id);
            cnt.set(did, (cnt.get(did) || 0) + 1);
          }
          for (const d of base) {
            if (d.status === "OPEN") d.bid_count = cnt.get(d.id) || 0;
          }
        }
      }

      setItems(base);
    } catch (e) {
      console.error(e);
      setItems([]);
      setError("Жагсаалт татахад алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  }

  function setLoadingFor(id: string, v: boolean) {
    setActLoading((p) => ({ ...p, [id]: v }));
  }

  // ASSIGNED -> ON_ROUTE (seller quick)
  async function markOnRoute(deliveryId: string) {
    if (!user) return;
    const d = items.find((x) => x.id === deliveryId);
    if (!d) return;

    if (!(d.status === "ASSIGNED" && !!d.chosen_driver_id)) {
      setError("Зөвхөн 'Жолооч сонгосон' үед 'Хүргэлт гарсан' дарна.");
      return;
    }

    setLoadingFor(deliveryId, true);
    setError(null);
    setMsg(null);

    try {
      const { error } = await supabase
        .from("deliveries")
        .update({ status: "ON_ROUTE" })
        .eq("id", deliveryId)
        .eq("seller_id", user.id)
        .eq("status", "ASSIGNED");

      if (error) {
        console.error(error);
        setError("Замд гарсан гэж тэмдэглэхэд алдаа гарлаа.");
        return;
      }

      setItems((prev) => prev.map((x) => (x.id === deliveryId ? { ...x, status: "ON_ROUTE" } : x)));
      setMsg("Замд гарсан гэж тэмдэглэлээ.");
      setTimeout(() => changeTab("ON_ROUTE"), 250);
    } finally {
      setLoadingFor(deliveryId, false);
    }
  }

  // CANCELLED -> seller_hidden=true (delete from CLOSED)
  async function hideCancelled(deliveryId: string) {
    if (!user) return;
    const d = items.find((x) => x.id === deliveryId);
    if (!d) return;

    if (d.status !== "CANCELLED") {
      setError("Зөвхөн 'Цуцалсан' хүргэлтийг л хаагдсанаас устгана.");
      return;
    }

    setLoadingFor(deliveryId, true);
    setError(null);
    setMsg(null);

    try {
      const { error } = await supabase
        .from("deliveries")
        .update({ seller_hidden: true })
        .eq("id", deliveryId)
        .eq("seller_id", user.id)
        .eq("status", "CANCELLED");

      if (error) {
        console.error(error);
        setError("Устгах (нуух) үед алдаа гарлаа.");
        return;
      }

      setItems((prev) => prev.filter((x) => x.id !== deliveryId));
      setMsg("Цуцалсан хүргэлтийг хаагдсанаас устгалаа.");
    } finally {
      setLoadingFor(deliveryId, false);
    }
  }

  const filtered = useMemo(() => {
    return items.filter((d) => getSellerTabForStatus(d.status) === activeTab);
  }, [items, activeTab]);

  const tabCounts = useMemo(() => {
    const out: Record<SellerTabId, number> = {
      OPEN: 0,
      ASSIGNED: 0,
      ON_ROUTE: 0,
      DELIVERED: 0,
      DISPUTE: 0,
      CLOSED: 0,
    };
    for (const d of items) out[getSellerTabForStatus(d.status)]++;
    return out;
  }, [items]);

  function logout() {
    localStorage.removeItem("incomeUser");
    router.replace("/");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Ачаалж байна…</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-sm font-semibold">Худалдагчийн самбар</h1>
          <button
            onClick={logout}
            className="text-[11px] px-4 py-2 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            Гарах
          </button>
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
          {SELLER_TABS.map((tab) => (
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

        {/* List */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
            Энэ таб дээр хүргэлт алга байна.
          </div>
        ) : (
          <section className="space-y-3">
            {filtered.map((d) => {
              const t = typeLabel(d.delivery_type);
              const b = badge(d.status);

              const canQuickOnRoute = d.status === "ASSIGNED" && !!d.chosen_driver_id;
              const canDeleteCancelled = d.status === "CANCELLED" && activeTab === "CLOSED";

              return (
                <div
                  key={d.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-4 hover:bg-slate-50 transition"
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
                          {shorten(d.from_address, 70)}
                        </div>
                        <div className="text-xs text-slate-700">
                          <span className="font-semibold text-slate-600">Хүргэх:</span>{" "}
                          {shorten(d.to_address, 70)}
                        </div>

                        {d.status === "OPEN" && (
                          <div className="text-[11px] text-slate-600">
                            Жолоочийн санал:{" "}
                            <span className="font-semibold text-slate-900">{d.bid_count || 0}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-slate-500">Үнэ</div>
                      <div className="text-sm font-semibold text-slate-900">{fmtPrice(d.price_mnt)}</div>
                    </div>
                  </div>

                  {/* ✅ QUICK BUTTONS ON CARD */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canQuickOnRoute && (
                      <button
                        onClick={() => void markOnRoute(d.id)}
                        disabled={!!actLoading[d.id]}
                        className="text-[11px] px-4 py-2 rounded-full bg-indigo-600 text-white font-semibold disabled:opacity-60"
                      >
                        {actLoading[d.id] ? "Тэмдэглэж байна…" : "Хүргэлт гарсан"}
                      </button>
                    )}

                    {canDeleteCancelled && (
                      <button
                        onClick={() => void hideCancelled(d.id)}
                        disabled={!!actLoading[d.id]}
                        className="text-[11px] px-4 py-2 rounded-full bg-slate-900 text-white font-semibold disabled:opacity-60"
                        title="seller_hidden=true"
                      >
                        {actLoading[d.id] ? "Устгаж байна…" : "Хаагдсанаас устгах"}
                      </button>
                    )}

                    <button
                      onClick={() => router.push(`/seller/delivery/${d.id}?tab=${activeTab}`)}
                      className="text-[11px] px-4 py-2 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      Дэлгэрэнгүй
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
