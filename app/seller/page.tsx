"use client";

/* ===========================
 * app/seller/page.tsx
 * CLEAN:
 * - OPEN дээр driver_bids count харуулна
 * - Tab дараалал lib/deliveryLogic.ts-тэй таарсан
 * - ✅ Quick action: ASSIGNED дээр "Хүргэлтэд гарсан" товч (ON_ROUTE + redirect)
 * =========================== */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DeliveryStatus, SELLER_TABS, SellerTabId } from "@/lib/deliveryLogic";

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

  seller_marked_paid: boolean | null;
  driver_confirmed_payment: boolean | null;
  closed_at: string | null;

  seller_hidden: boolean | null;
  bids_count: number;

  chosen_driver_id: string | null;
};

const TAB_IDS: SellerTabId[] = SELLER_TABS.map((t) => t.id);

/* ---------- helpers ---------- */
function typeLabel(deliveryType: string | null) {
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

function statusBadge(status: DeliveryStatus) {
  switch (status) {
    case "OPEN":
      return {
        text: "Нээлттэй",
        className: "bg-emerald-50 text-emerald-700 border-emerald-100",
      };
    case "ASSIGNED":
      return {
        text: "Жолооч сонгосон",
        className: "bg-sky-50 text-sky-700 border-sky-100",
      };
    case "ON_ROUTE":
      return {
        text: "Замд",
        className: "bg-indigo-50 text-indigo-700 border-indigo-100",
      };
    case "DELIVERED":
      return {
        text: "Хүргэсэн",
        className: "bg-slate-900 text-white border-slate-900",
      };
    case "DISPUTE":
      return {
        text: "Маргаан",
        className: "bg-rose-50 text-rose-700 border-rose-100",
      };
    case "CLOSED":
      return {
        text: "Хаагдсан",
        className: "bg-emerald-900 text-emerald-50 border-emerald-900",
      };
    case "CANCELLED":
      return {
        text: "Цуцалсан",
        className: "bg-rose-50 text-rose-700 border-rose-100",
      };
    default:
      return {
        text: status,
        className: "bg-slate-50 text-slate-600 border-slate-100",
      };
  }
}

function shorten(s: string | null, max = 110) {
  if (!s) return "";
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+$/, "") + "…";
}

function formatPrice(n: number | null) {
  if (!n) return "Үнэ тохиролцоно";
  return n.toLocaleString("mn-MN") + "₮";
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("mn-MN", { month: "2-digit", day: "2-digit" }) +
    " " +
    d.toLocaleTimeString("mn-MN", { hour: "2-digit", minute: "2-digit" })
  );
}

function filterByTab(tab: SellerTabId, items: DeliveryRow[]) {
  return items.filter((d) => {
    switch (tab) {
      case "OPEN":
        return d.status === "OPEN";
      case "ASSIGNED":
        return d.status === "ASSIGNED";
      case "ON_ROUTE":
        return d.status === "ON_ROUTE";
      case "DELIVERED":
        return d.status === "DELIVERED";
      case "DISPUTE":
        return d.status === "DISPUTE";
      case "CLOSED":
        return d.status === "CLOSED" || d.status === "CANCELLED";
      default:
        return true;
    }
  });
}

/* =========================== */

export default function SellerDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [user, setUser] = useState<IncomeUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [activeTab, setActiveTab] = useState<SellerTabId>("OPEN");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ✅ Quick action loading: deliveryId -> boolean
  const [quickLoading, setQuickLoading] = useState<Record<string, boolean>>({});

  const filtered = useMemo(
    () => filterByTab(activeTab, deliveries),
    [activeTab, deliveries]
  );

  const tabCounts = useMemo(() => {
    return SELLER_TABS.reduce((acc, t) => {
      acc[t.id] = filterByTab(t.id, deliveries).length;
      return acc;
    }, {} as Record<SellerTabId, number>);
  }, [deliveries]);

  /* ---------- auth ---------- */
  useEffect(() => {
    const raw = window.localStorage.getItem("incomeUser");
    if (!raw) {
      router.replace("/");
      return;
    }
    const parsed: IncomeUser = JSON.parse(raw);
    if (parsed.role !== "seller") {
      router.replace("/");
      return;
    }
    setUser(parsed);
    setLoadingUser(false);
  }, [router]);

  /* ---------- tab init ---------- */
  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab && TAB_IDS.includes(urlTab as SellerTabId)) {
      setActiveTab(urlTab as SellerTabId);
      localStorage.setItem("sellerActiveTab", urlTab);
      return;
    }
    const stored = localStorage.getItem("sellerActiveTab");
    if (stored && TAB_IDS.includes(stored as SellerTabId)) {
      setActiveTab(stored as SellerTabId);
    }
  }, [searchParams]);

  function changeTab(tab: SellerTabId) {
    setActiveTab(tab);
    localStorage.setItem("sellerActiveTab", tab);
    router.push(`/seller?tab=${tab}`);
  }

  /* ---------- fetch ---------- */
  useEffect(() => {
    if (!user) return;
    void fetchDeliveries(user.id);
  }, [user]);

  async function fetchDeliveries(sellerId: string) {
    try {
      setLoadingList(true);
      setError(null);

      const { data, error } = await supabase
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
          seller_marked_paid,
          driver_confirmed_payment,
          closed_at,
          seller_hidden,
          chosen_driver_id,
          driver_bids(count)
        `
        )
        .eq("seller_id", sellerId)
        .eq("seller_hidden", false)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows: DeliveryRow[] = (data || []).map((d: any) => ({
        id: d.id,
        seller_id: d.seller_id,
        from_address: d.from_address,
        to_address: d.to_address,
        note: d.note,
        status: d.status,
        created_at: d.created_at,
        price_mnt: d.price_mnt,
        delivery_type: d.delivery_type,
        seller_marked_paid: !!d.seller_marked_paid,
        driver_confirmed_payment: !!d.driver_confirmed_payment,
        closed_at: d.closed_at,
        seller_hidden: !!d.seller_hidden,
        chosen_driver_id: d.chosen_driver_id ?? null,
        bids_count:
          Array.isArray(d.driver_bids) && d.driver_bids[0]?.count
            ? Number(d.driver_bids[0].count)
            : 0,
      }));

      setDeliveries(rows);
    } catch {
      setError("Хүргэлтийн жагсаалт татахад алдаа гарлаа.");
      setDeliveries([]);
    } finally {
      setLoadingList(false);
    }
  }

  /* ✅ QUICK: ASSIGNED -> ON_ROUTE + redirect */
  async function handleQuickMarkOnRoute(deliveryId: string) {
    if (!user) return;

    setQuickLoading((prev) => ({ ...prev, [deliveryId]: true }));
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("deliveries")
        .update({ status: "ON_ROUTE" })
        .eq("id", deliveryId)
        .eq("seller_id", user.id)
        .eq("status", "ASSIGNED"); // хамгаалалт

      if (error) {
        console.error(error);
        setError("“Хүргэлтэд гарсан” тэмдэглэхэд алдаа гарлаа.");
        return;
      }

      // UI дээр локал update
      setDeliveries((prev) =>
        prev.map((d) => (d.id === deliveryId ? { ...d, status: "ON_ROUTE" } : d))
      );

      // ✅ ШУУД ON_ROUTE tab руу
      localStorage.setItem("sellerActiveTab", "ON_ROUTE");
      router.push("/seller?tab=ON_ROUTE");
    } finally {
      setQuickLoading((prev) => ({ ...prev, [deliveryId]: false }));
    }
  }

  /* ---------- render ---------- */
  if (loadingUser || loadingList) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Ачаалж байна…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Хэрэглэгч олдсонгүй.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-sm font-semibold">Худалдагчийн самбар</h1>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/seller/new-delivery")}
              className="text-[11px] px-5 py-2 rounded-full bg-emerald-600 text-white font-semibold"
            >
              + Хүргэлт нэмэх
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {message && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-xs">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-2 text-xs">
            {error}
          </div>
        )}

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
              {tabCounts[tab.id] > 0 && (
                <span className="ml-1">({tabCounts[tab.id]})</span>
              )}
            </button>
          ))}
        </div>

        <section className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
              Энэ таб дээр одоогоор хүргэлт алга байна.
            </div>
          ) : (
            filtered.map((d) => {
              const t = typeLabel(d.delivery_type);
              const sb = statusBadge(d.status);
              const canQuickOnRoute = d.status === "ASSIGNED" && !!d.chosen_driver_id;

              return (
                <div
                  key={d.id}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-emerald-300 hover:shadow-sm transition"
                >
                  {/* CARD TOP */}
                  <button
                    onClick={() => router.push(`/seller/delivery/${d.id}?tab=${activeTab}`)}
                    className="w-full text-left"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">
                          #{d.id.slice(0, 6)}
                        </span>

                        <span
                          className={
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] " +
                            sb.className
                          }
                        >
                          {sb.text}
                        </span>

                        {d.status === "OPEN" && d.bids_count > 0 && (
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            Санал: {d.bids_count}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-600">
                        <span>{t.icon}</span>
                        <span className="font-medium">{t.label}</span>
                        <span>•</span>
                        <span>{formatPrice(d.price_mnt)}</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600">
                        <div>
                          <div className="text-[10px] font-semibold text-slate-500">
                            АВАХ
                          </div>
                          <p>{shorten(d.from_address, 60)}</p>
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold text-slate-500">
                            ХҮРГЭХ
                          </div>
                          <p>{shorten(d.to_address, 60)}</p>
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-400">
                        Үүсгэсэн: {formatDateTime(d.created_at)}
                      </p>
                    </div>
                  </button>

                  {/* QUICK ACTIONS (карт дээр шууд) */}
                  {canQuickOnRoute && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleQuickMarkOnRoute(d.id);
                        }}
                        disabled={!!quickLoading[d.id]}
                        className="text-[11px] px-4 py-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {quickLoading[d.id] ? "Тэмдэглэж байна…" : "Хүргэлтэд гарсан"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>
      </main>
    </div>
  );
}
