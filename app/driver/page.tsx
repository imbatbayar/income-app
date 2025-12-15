"use client";

/* ===========================
 * app/driver/page.tsx (FINAL v4)
 *
 * ✅ ШИНЭ ЛОГИК:
 * - "Нээлттэй" таб: OPEN хүргэлтүүд (миний хүсэлт байхгүй)
 * - "Хүсэлт" таб: OPEN хүргэлтүүд (миний хүсэлттэй)
 * - "Намайг сонгосон": ASSIGNED + chosen_driver_id = me
 * - "Замд" / "Хүргэсэн" / "Хаагдсан" / "Маргаан": зөвхөн миний оноогдсон хүргэлтүүд
 * - Хүсэлт таб дээрээс цуцалбал -> Нээлттэй рүү буцна
 * - Сонгогдсон (ASSIGNED) бол цуцлах боломжгүй (зөвхөн seller л цуцална)
 *
 * ✅ QUICK:
 * - DELIVERED дээр "Төлбөр авсан" quick товч
 * - CLOSED дээр "Хаагдсанаас устгах" (driver_hidden=true)
 * =========================== */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  DeliveryStatus,
  DRIVER_TABS,
  DriverTabId,
  getDriverTabForStatus,
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
      return { text: "Оносон", cls: "bg-sky-50 text-sky-700 border-sky-100" };
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

function Pill({
  label,
  value,
  accent = "slate",
}: {
  label: string;
  value: string;
  accent?: "emerald" | "rose" | "sky" | "slate";
}) {
  const acc =
    accent === "emerald"
      ? "bg-emerald-50 border-emerald-100 text-emerald-800"
      : accent === "rose"
      ? "bg-rose-50 border-rose-100 text-rose-800"
      : accent === "sky"
      ? "bg-sky-50 border-sky-100 text-sky-800"
      : "bg-slate-50 border-slate-200 text-slate-800";

  return (
    <div className={`rounded-xl border px-3 py-2 ${acc}`}>
      <div className="text-[11px] opacity-70">{label}</div>
      <div className="text-sm font-semibold leading-snug">{value}</div>
    </div>
  );
}

export default function DriverDashboardPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [user, setUser] = useState<IncomeUser | null>(null);
  const [activeTab, setActiveTab] = useState<DriverTabId>("OPEN");

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DeliveryRow[]>([]);
  const [myBids, setMyBids] = useState<Record<string, BidLite>>({});
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [actLoading, setActLoading] = useState<Record<string, boolean>>({});

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

  // init tab
  useEffect(() => {
    const urlTab = sp.get("tab");
    const valid = DRIVER_TABS.some((t) => t.id === (urlTab as any));
    if (urlTab && valid) {
      setActiveTab(urlTab as DriverTabId);
      localStorage.setItem("driverActiveTab", urlTab);
      return;
    }
    const stored = localStorage.getItem("driverActiveTab");
    const validStored = DRIVER_TABS.some((t) => t.id === (stored as any));
    if (stored && validStored) setActiveTab(stored as DriverTabId);
  }, [sp]);

  function changeTab(tab: DriverTabId) {
    setActiveTab(tab);
    localStorage.setItem("driverActiveTab", tab);
    router.push(`/driver?tab=${tab}`);
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

  async function fetchAll(driverId: string) {
    setLoading(true);
    setError(null);

    try {
      // ✅ OPEN бүх хүргэлтүүд (driver_hidden шүүлт хийнэ)
      // ✅ Бусад төлөвүүд: зөвхөн надад оноогдсон
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
          dispute_opened_at,
          closed_at,
          driver_hidden
        `
        )
        .or(`status.eq.OPEN,chosen_driver_id.eq.${driverId}`)
        .eq("driver_hidden", false)
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
        dispute_opened_at: d.dispute_opened_at,
        closed_at: d.closed_at,
        driver_hidden: !!d.driver_hidden,
      }));

      // my bids
      const { data: bids, error: e2 } = await supabase
        .from("driver_bids")
        .select("id, driver_id, delivery_id, created_at")
        .eq("driver_id", driverId);

      if (e2) throw e2;

      const bm: Record<string, BidLite> = {};
      (bids || []).forEach((b: any) => {
        bm[b.delivery_id] = b;
      });

      setItems(base);
      setMyBids(bm);
      setMsg(null);
    } catch (e: any) {
      console.error(e);
      setError("Өгөгдөл татахад алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setLoading(false);
    }
  }

  // --------- ACTIONS ---------

  async function placeBid(deliveryId: string) {
    if (!user) return;
    setActLoading((p) => ({ ...p, [deliveryId]: true }));
    setError(null);
    setMsg(null);

    try {
      const { data, error: e1 } = await supabase
        .from("driver_bids")
        .insert({ delivery_id: deliveryId, driver_id: user.id })
        .select("id, driver_id, delivery_id, created_at")
        .maybeSingle();

      if (e1) throw e1;

      setMyBids((p) => ({ ...p, [deliveryId]: data as any }));
      setMsg("Авах хүсэлт илгээлээ.");
      changeTab("REQUESTS");
    } catch (e: any) {
      console.error(e);
      setError("Хүсэлт илгээхэд алдаа гарлаа.");
    } finally {
      setActLoading((p) => ({ ...p, [deliveryId]: false }));
    }
  }

  async function cancelBid(deliveryId: string) {
    if (!user) return;
    const b = myBids[deliveryId];
    if (!b) return;

    // ✅ Сонгогдсон бол цуцлахгүй (OPEN дээр л цуцлах боломжтой)
    const cur = items.find((x) => x.id === deliveryId);
    if (cur && cur.status !== "OPEN") {
      setError("Сонгогдсон/явж буй хүргэлт дээр хүсэлт цуцлах боломжгүй.");
      return;
    }

    setActLoading((p) => ({ ...p, [deliveryId]: true }));
    setError(null);
    setMsg(null);

    try {
      const { error: e1 } = await supabase
        .from("driver_bids")
        .delete()
        .eq("id", b.id)
        .eq("driver_id", user.id);

      if (e1) throw e1;

      setMyBids((p) => {
        const c = { ...p };
        delete c[deliveryId];
        return c;
      });

      setMsg("Хүсэлт цуцлагдлаа.");
      changeTab("OPEN");
    } catch (e: any) {
      console.error(e);
      setError("Хүсэлт цуцлахад алдаа гарлаа.");
    } finally {
      setActLoading((p) => ({ ...p, [deliveryId]: false }));
    }
  }

  async function quickConfirmPayment(deliveryId: string) {
    if (!user) return;

    setActLoading((p) => ({ ...p, [deliveryId]: true }));
    setError(null);
    setMsg(null);

    try {
      const cur = items.find((x) => x.id === deliveryId);
      if (!cur) return;

      if (!(cur.status === "DELIVERED" && cur.chosen_driver_id === user.id)) {
        setError("Зөвхөн 'Хүргэсэн' үед төлбөр батална.");
        return;
      }

      const next = true;
      const willClose = shouldCloseDelivery({
        status: cur.status,
        seller_marked_paid: cur.seller_marked_paid,
        driver_confirmed_payment: next,
      });

      const nextStatus: DeliveryStatus = willClose ? "CLOSED" : "DELIVERED";
      const closedAt = willClose ? new Date().toISOString() : cur.closed_at;

      const { error: e1 } = await supabase
        .from("deliveries")
        .update({
          driver_confirmed_payment: next,
          status: nextStatus,
          closed_at: closedAt,
        })
        .eq("id", deliveryId)
        .eq("chosen_driver_id", user.id)
        .eq("status", "DELIVERED");

      if (e1) throw e1;

      await fetchAll(user.id);
      setMsg("Төлбөр авснаа баталлаа.");
    } catch (e: any) {
      console.error(e);
      setError("Төлбөр батлахад алдаа гарлаа.");
    } finally {
      setActLoading((p) => ({ ...p, [deliveryId]: false }));
    }
  }

  async function hideClosedForDriver(deliveryId: string) {
    if (!user) return;
    setActLoading((p) => ({ ...p, [deliveryId]: true }));
    setError(null);
    setMsg(null);

    try {
      const { error: e1 } = await supabase
        .from("deliveries")
        .update({ driver_hidden: true })
        .eq("id", deliveryId);

      if (e1) throw e1;

      await fetchAll(user.id);
      setMsg("Хаагдсанаас устгалаа.");
    } catch (e: any) {
      console.error(e);
      setError("Устгахад алдаа гарлаа.");
    } finally {
      setActLoading((p) => ({ ...p, [deliveryId]: false }));
    }
  }

  // --------- FILTER + COUNTS ---------

  const filtered = useMemo(() => {
    if (!user) return [];

    return items.filter((d) => {
      // OPEN ба REQUESTS нь OPEN статус дээр "myBid" байгаа/эсэхээр сална
      const hasMyBid = !!myBids[d.id];
      const isMine = d.chosen_driver_id === user.id;

      if (activeTab === "OPEN") {
        return d.status === "OPEN" && !hasMyBid;
      }
      if (activeTab === "REQUESTS") {
        return d.status === "OPEN" && hasMyBid;
      }

      // бусад табууд: status + зөвхөн миний оноогдсон
      return getDriverTabForStatus(d.status) === activeTab && isMine;
    });
  }, [activeTab, items, myBids, user]);

  const tabCounts = useMemo(() => {
    if (!user) return Object.fromEntries(DRIVER_TABS.map((t) => [t.id, 0])) as Record<string, number>;

    const c: Record<string, number> = {};
    for (const t of DRIVER_TABS) c[t.id] = 0;

    for (const d of items) {
      const hasMyBid = !!myBids[d.id];
      const isMine = d.chosen_driver_id === user.id;

      if (d.status === "OPEN") {
        if (hasMyBid) c["REQUESTS"] = (c["REQUESTS"] || 0) + 1;
        else c["OPEN"] = (c["OPEN"] || 0) + 1;
        continue;
      }

      // бусад төлөвүүд зөвхөн минийхийг тоолно
      if (!isMine) continue;

      const tab = getDriverTabForStatus(d.status);
      c[tab] = (c[tab] || 0) + 1;
    }

    return c;
  }, [items, myBids, user]);

  // --------- UI ---------

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 pb-12 pt-6">
        <div className="mb-4">
          <div className="text-xs text-slate-500">Жолооч</div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {DRIVER_TABS.map((t) => {
            const isActive = t.id === activeTab;
            const n = tabCounts[t.id] || 0;
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
                {t.label} <span className="ml-1 text-xs opacity-70">({n})</span>
              </button>
            );
          })}
        </div>

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

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">Ачаалж байна…</div>
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

              const hasMyBid = !!myBids[d.id];
              const isMine = user ? d.chosen_driver_id === user.id : false;

              return (
                <div key={d.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{t.icon}</span>
                      <span className="text-sm font-semibold text-slate-900">{t.label}</span>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${b.cls}`}>
                        {b.text}
                      </span>
                      {isMine && d.status !== "OPEN" && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          Танд
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{fmtDT(d.created_at)}</div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <Pill label="Хаанаас" value={from} accent="emerald" />
                    <Pill label="Хаашаа" value={to} accent="rose" />
                    <Pill label="Юу хүргэх" value={what} accent="sky" />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
                        {fmtPrice(d.price_mnt)}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {/* OPEN tab: request */}
                      {activeTab === "OPEN" && d.status === "OPEN" && !hasMyBid && (
                        <button
                          onClick={() => placeBid(d.id)}
                          disabled={!!actLoading[d.id]}
                          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          {actLoading[d.id] ? "Илгээж байна…" : "Авах хүсэлт"}
                        </button>
                      )}

                      {/* REQUESTS tab: cancel */}
                      {activeTab === "REQUESTS" && d.status === "OPEN" && hasMyBid && (
                        <button
                          onClick={() => cancelBid(d.id)}
                          disabled={!!actLoading[d.id]}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-60"
                        >
                          {actLoading[d.id] ? "Цуцалж байна…" : "Хүсэлт цуцлах"}
                        </button>
                      )}

                      {/* DELIVERED quick */}
                      {activeTab === "DELIVERED" &&
                        d.status === "DELIVERED" &&
                        isMine &&
                        !d.driver_confirmed_payment && (
                          <button
                            onClick={() => quickConfirmPayment(d.id)}
                            disabled={!!actLoading[d.id]}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {actLoading[d.id] ? "Баталж байна…" : "Төлбөр авсан"}
                          </button>
                        )}

                      {/* CLOSED: hide */}
                      {activeTab === "CLOSED" &&
                        (d.status === "CLOSED" || d.status === "CANCELLED") &&
                        isMine && (
                          <button
                            onClick={() => hideClosedForDriver(d.id)}
                            disabled={!!actLoading[d.id]}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-60"
                          >
                            {actLoading[d.id] ? "Устгаж байна…" : "Хаагдсанаас устгах"}
                          </button>
                        )}

                      <button
                        onClick={() => router.push(`/driver/delivery/${d.id}?tab=${activeTab}`)}
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

        <div className="mt-10 flex items-center justify-between gap-3 text-xs text-slate-500">
          <span>INCOME · Driver</span>
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
