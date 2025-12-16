"use client";

/* ===========================
 * app/seller/page.tsx (FINAL v3.1)
 *
 * ✅ UI өөрчлөхгүй
 * ✅ ASSIGNED үед Seller "Жолооч барааг авч явлаа" → ON_ROUTE (шинэ дүрэм)
 * ✅ CLOSED дээр "устгах" байхгүй
 * ✅ DELIVERED дээр "Төлбөр төлсөн" хурдан товч (Detail-ийн өмнө)
 * ✅ Давхар даралтыг actLoading-р түгжинэ (idempotent update)
 * =========================== */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  DeliveryStatus,
  SELLER_TABS,
  SellerTabId,
  getSellerTabForStatus,
  canSellerMarkPaid,
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
    return String(iso);
  }
}

function shorten(s: string | null, max = 70) {
  if (!s) return "—";
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+$/, "") + "…";
}

function typeLabel(deliveryType: string | null): { icon: string; label: string } {
  // ⚠️ UI-г өөрчлөхгүй. Одоохондоо хуучин label-уудыг хэвээр үлдээв.
  // (#13 дээр “2 төрөл” болгохыг дараагийн алхмаар new-delivery дээр нэг мөр болгоно.)
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
    case "PAID":
      return { text: "Төлсөн", cls: "bg-emerald-50 text-emerald-800 border-emerald-100" };
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

function filterByTab(tab: SellerTabId, items: DeliveryRow[]) {
  return items.filter((d) => getSellerTabForStatus(d.status) === tab);
}

function Pill({
  label,
  value,
  accent = "slate",
}: {
  label: string;
  value: string;
  accent?: "emerald" | "rose" | "sky" | "slate" | "amber" | "indigo";
}) {
  const acc =
    accent === "emerald"
      ? "bg-emerald-50 border-emerald-100 text-emerald-800"
      : accent === "rose"
      ? "bg-rose-50 border-rose-100 text-rose-800"
      : accent === "sky"
      ? "bg-sky-50 border-sky-100 text-sky-800"
      : accent === "amber"
      ? "bg-amber-50 border-amber-100 text-amber-800"
      : accent === "indigo"
      ? "bg-indigo-50 border-indigo-100 text-indigo-800"
      : "bg-slate-50 border-slate-200 text-slate-800";

  return (
    <div className={`rounded-xl border px-3 py-2 ${acc}`}>
      <div className="text-[11px] opacity-70">{label}</div>
      <div className="text-sm font-semibold leading-snug">{value}</div>
    </div>
  );
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
        status: d.status,
        created_at: d.created_at,
        price_mnt: d.price_mnt,
        delivery_type: d.delivery_type,
        chosen_driver_id: d.chosen_driver_id,
        seller_marked_paid: !!d.seller_marked_paid,
        driver_confirmed_payment: !!d.driver_confirmed_payment,
        closed_at: d.closed_at,
        dispute_reason: d.dispute_reason,
        dispute_opened_at: d.dispute_opened_at,
        seller_hidden: !!d.seller_hidden,
      }));

      // OPEN дээр bid_count нэмнэ (driver_bids)
      const openIds = base.filter((x) => x.status === "OPEN").map((x) => x.id);

      let bidMap: Record<string, number> = {};
      if (openIds.length) {
        const { data: bids, error: e2 } = await supabase
          .from("driver_bids")
          .select("delivery_id")
          .in("delivery_id", openIds);

        if (!e2 && bids) {
          bidMap = bids.reduce((acc: any, r: any) => {
            const k = r.delivery_id as string;
            acc[k] = (acc[k] || 0) + 1;
            return acc;
          }, {});
        }
      }

      const merged = base.map((d) => ({
        ...d,
        bid_count: d.status === "OPEN" ? bidMap[d.id] || 0 : undefined,
      }));

      setItems(merged);
      setMsg(null);
    } catch (e: any) {
      console.error(e);
      setError("Өгөгдөл татахад алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setLoading(false);
    }
  }

  // ✅ Seller: ASSIGNED үед "Жолооч барааг авч явлаа" → ON_ROUTE
  async function markOnRouteBySeller(deliveryId: string) {
    if (!user) return;
    if (actLoading[deliveryId]) return;

    setActLoading((p) => ({ ...p, [deliveryId]: true }));
    setMsg(null);
    setError(null);

    try {
      // ✅ Update + verify (idempotent & guarded)
      const { data, error: e1 } = await supabase
        .from("deliveries")
        .update({ status: "ON_ROUTE" })
        .eq("id", deliveryId)
        .eq("seller_id", user.id)
        .eq("status", "ASSIGNED")
        .not("chosen_driver_id", "is", null)
        .select("id,status")
        .maybeSingle();

      if (e1) throw e1;

      if (!data || (data as any).status !== "ON_ROUTE") {
        setError("Шилжилт амжилтгүй. (ASSIGNED→ON_ROUTE) Дахин оролдоно уу.");
        return;
      }

      // ✅ local state update
      setItems((prev) =>
        prev.map((x) => (x.id === deliveryId ? { ...x, status: "ON_ROUTE" as any } : x))
      );

      // ✅ tab force
      changeTab("ON_ROUTE");
      setMsg("Жолооч барааг авч явсан гэж тэмдэглэлээ.");

      // ✅ background refresh
      void fetchAll(user.id);
    } catch (e: any) {
      console.error(e);
      setError("Шинэчлэхэд алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setActLoading((p) => ({ ...p, [deliveryId]: false }));
    }
  }

  // ✅ Seller: DELIVERED үед л "Төлбөр төлсөн" дарж PAID болгоно
  async function markPaidQuick(deliveryId: string) {
    if (!user) return;
    if (actLoading[deliveryId]) return;

    setActLoading((p) => ({ ...p, [deliveryId]: true }));
    setMsg(null);
    setError(null);

    try {
      const { data, error: e1 } = await supabase
        .from("deliveries")
        .update({ seller_marked_paid: true, status: "PAID" })
        .eq("id", deliveryId)
        .eq("seller_id", user.id)
        .eq("status", "DELIVERED")
        .eq("seller_marked_paid", false)
        .select("id,status,seller_marked_paid")
        .maybeSingle();

      if (e1) throw e1;

      // local update
      if (data) {
        setItems((prev) =>
          prev.map((x) =>
            x.id === deliveryId ? { ...x, status: "PAID" as any, seller_marked_paid: true } : x
          )
        );
      }

      changeTab("PAID");
      setMsg("Төлбөр төлсөн гэж тэмдэглэлээ.");

      void fetchAll(user.id);
    } catch (e: any) {
      console.error(e);
      setError("Шинэчлэхэд алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setActLoading((p) => ({ ...p, [deliveryId]: false }));
    }
  }

  const filtered = useMemo(() => filterByTab(activeTab, items), [activeTab, items]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 pb-12 pt-6">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">Худалдагч</div>
          </div>

          <button
            onClick={() => router.push("/seller/new-delivery")}
            className="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 active:scale-[0.99]"
          >
            ＋ Хүргэлт нэмэх
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-5 flex flex-wrap gap-2">
          {SELLER_TABS.map((t) => {
            const isActive = t.id === activeTab;
            return (
              <button
                key={t.id}
                onClick={() => changeTab(t.id)}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  isActive
                    ? "border-slate-900 bg-white text-slate-900 shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}
        {msg && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {msg}
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
            Ачаалж байна…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
            Энэ таб дээр одоогоор хүргэлт алга.
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((d) => {
              const b = badge(d.status);
              const t = typeLabel(d.delivery_type);

              const from = shorten(d.from_address, 48);
              const to = shorten(d.to_address, 48);
              const what = shorten(d.note, 80);

              const bidCount = d.status === "OPEN" ? Number(d.bid_count || 0) : 0;

              const canPayQuick =
                activeTab === "DELIVERED" &&
                canSellerMarkPaid({
                  status: d.status,
                  seller_marked_paid: !!d.seller_marked_paid,
                });

              const canSellerOnRoute =
                activeTab === "ASSIGNED" &&
                d.status === "ASSIGNED" &&
                !!d.chosen_driver_id;

              return (
                <div
                  key={d.id}
                  className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  {/* Top row */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{t.icon}</span>
                      <span className="text-sm font-semibold text-slate-900">{t.label}</span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${b.cls}`}
                      >
                        {b.text}
                      </span>

                      {d.status === "OPEN" && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          Санал: {bidCount}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-500">{fmtDT(d.created_at)}</div>
                  </div>

                  {/* Main tiles */}
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <Pill label="Хаанаас" value={from} accent="emerald" />
                    <Pill label="Хаашаа" value={to} accent="rose" />
                    <Pill label="Юу хүргэх" value={what} accent="sky" />
                  </div>

                  {/* Bottom row */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
                        {fmtPrice(d.price_mnt)}
                      </span>

                      {d.status === "DISPUTE" && d.dispute_opened_at && (
                        <span className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
                          Маргаан нээсэн: {fmtDT(d.dispute_opened_at)}
                        </span>
                      )}

                      {d.status === "CLOSED" && d.closed_at && (
                        <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                          Хаагдсан: {fmtDT(d.closed_at)}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {/* ✅ ASSIGNED дээр Seller: "Жолооч барааг авч явлаа" */}
                      {canSellerOnRoute && (
                        <button
                          onClick={() => markOnRouteBySeller(d.id)}
                          disabled={!!actLoading[d.id]}
                          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                          {actLoading[d.id] ? "Түр хүлээнэ үү…" : "Жолооч барааг авч явлаа"}
                        </button>
                      )}

                      {/* ✅ DELIVERED дээр хурдан "Төлбөр төлсөн" */}
                      {canPayQuick && (
                        <button
                          onClick={() => markPaidQuick(d.id)}
                          disabled={!!actLoading[d.id]}
                          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          {actLoading[d.id] ? "Түр хүлээнэ үү…" : "Төлбөр төлсөн"}
                        </button>
                      )}

                      {/* ✅ Detail */}
                      <button
                        onClick={() => router.push(`/seller/delivery/${d.id}?tab=${activeTab}`)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-slate-300"
                      >
                        Дэлгэрэнгүй
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer quick */}
        <div className="mt-10 flex items-center justify-between gap-3 text-xs text-slate-500">
          <span>INCOME · Seller</span>
          <button
            onClick={() => {
              try {
                localStorage.removeItem("incomeUser");
              } catch {}
              router.push("/");
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300"
          >
            Гарах
          </button>
        </div>
      </div>
    </div>
  );
}
