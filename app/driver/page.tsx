"use client";

export const dynamic = "force-dynamic";

/* ===========================
 * app/driver/page.tsx (FINAL v7.2.1)
 *
 * ✅ FIX (Vercel build):
 * - useSearchParams() MUST be inside <Suspense> boundary (Next rule)
 * - force-dynamic to avoid prerender crash on /driver
 *
 * ✅ UI/logic: unchanged
 * =========================== */

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  DeliveryStatus,
  DRIVER_TABS,
  DriverTabId,
  getDriverTabForStatus,
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

  // ✅ UB admin fields (шинэ)
  pickup_district: string | null;
  pickup_khoroo: string | null;
  dropoff_district: string | null;
  dropoff_khoroo: string | null;

  status: DeliveryStatus;
  created_at: string;

  price_mnt: number | null;
  delivery_type: string | null;

  chosen_driver_id: string | null;

  // legacy (query-д байж болох ч UI таб/товч байхгүй)
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

function shorten(s: string | null, n = 60) {
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
      return { text: "Танд оноосон", cls: "bg-sky-50 text-sky-700 border-sky-100" };
    case "ON_ROUTE":
      return { text: "Замд", cls: "bg-indigo-50 text-indigo-700 border-indigo-100" };
    case "DELIVERED":
      return { text: "Хүргэсэн", cls: "bg-amber-50 text-amber-700 border-amber-100" };

    // legacy badge (табууд байхгүй ч харагдаж болно)
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

/**
 * ✅ Wrapper: Next build дээр useSearchParams() алдаа гаргахгүй
 * - useSearchParams хэрэглэж буй component-г Suspense дотор ажиллуулна
 * - UI логикт өөрчлөлт 0
 */
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
  const [activeTab, setActiveTab] = useState<DriverTabId>("OPEN");

  const [items, setItems] = useState<DeliveryRow[]>([]);
  const [myBids, setMyBids] = useState<BidLite[]>([]);

  const [sellerMap, setSellerMap] = useState<Record<string, SellerLite>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // action lock per deliveryId
  const [actLoading, setActLoading] = useState<Record<string, boolean>>({});

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
    const q = sp.get("tab") as DriverTabId | null;
    if (q && DRIVER_TABS.find((t) => t.id === q)) setActiveTab(q);
  }, [sp]);

  // ---------------- data load ----------------
  useEffect(() => {
    if (!user) return;
    void fetchAll(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function fetchSellersForMine(deliveries: DeliveryRow[], driverId: string) {
    // Зөвхөн өөрт оноогдсон, OPEN биш төлвүүдийн seller_id-г татна
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
      const { data, error } = await supabase
        .from("users")
        .select("id,name,phone")
        .in("id", sellerIds);

      if (error) {
        console.warn(error);
        return;
      }

      const map: Record<string, SellerLite> = {};
      for (const u of (data || []) as any[]) {
        map[u.id] = { id: u.id, name: u.name ?? null, phone: u.phone ?? null };
      }
      setSellerMap(map);
    } catch (e) {
      console.warn(e);
    }
  }

  async function fetchAll(driverId: string) {
    setLoading(true);
    setError(null);

    try {
      // 1) deliveries (exclude hidden)
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

      // 2) my bids (OPEN/REQUESTS section)
      const { data: b1, error: e2 } = await supabase
        .from("driver_bids")
        .select("id,driver_id,delivery_id,created_at")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false });

      if (e2) throw e2;

      const deliveries = (d1 || []) as any as DeliveryRow[];

      // ⚙️ Хэрэв DB дээр талбар дутуу байвал null болгож “уналтгүй” болгоно
      const safeDeliveries = deliveries.map((x) => ({
        ...x,
        pickup_district: (x as any).pickup_district ?? null,
        pickup_khoroo: (x as any).pickup_khoroo ?? null,
        dropoff_district: (x as any).dropoff_district ?? null,
        dropoff_khoroo: (x as any).dropoff_khoroo ?? null,
      })) as DeliveryRow[];

      setItems(safeDeliveries);
      setMyBids((b1 || []) as BidLite[]);

      // ✅ seller info preload
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

  const filtered = useMemo(() => {
    if (!user) return [];

    return items.filter((d) => {
      // OPEN/REQUESTS: only OPEN deliveries
      if (activeTab === "OPEN") return d.status === "OPEN" && !myBidSet.has(d.id);
      if (activeTab === "REQUESTS") return d.status === "OPEN" && myBidSet.has(d.id);

      // Only my assigned flows
      if (activeTab === "ASSIGNED") return d.status === "ASSIGNED" && d.chosen_driver_id === user.id;
      if (activeTab === "ON_ROUTE") return d.status === "ON_ROUTE" && d.chosen_driver_id === user.id;

      // DELIVERED tab: status DELIVERED + legacy statuses (UI нэгтгэл)
      if (activeTab === "DELIVERED") {
        const tab = getDriverTabForStatus(d.status);
        return tab === "DELIVERED" && d.chosen_driver_id === user.id;
      }

      return false;
    });
  }, [items, activeTab, myBidSet, user]);

  function changeTab(tab: DriverTabId) {
    setActiveTab(tab);
    router.push(`/driver?tab=${tab}`);
  }

  // ---------------- actions ----------------
  async function requestDelivery(deliveryId: string) {
    if (!user) return;
    if (actLoading[deliveryId]) return;

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
      } else if (data) {
        setMyBids((prev) => [{ ...(data as any) }, ...prev]);
      }

      changeTab("REQUESTS");
      setMsg("Хүсэлт илгээлээ.");
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
      const my = myBids.find((b) => b.delivery_id === deliveryId);
      if (my) {
        const { error } = await supabase
          .from("driver_bids")
          .delete()
          .eq("id", my.id)
          .eq("driver_id", user.id);

        if (error) throw error;

        // ✅ local state sync
        setMyBids((prev) => prev.filter((x) => x.id !== my.id));
      }

      setMsg("Хүсэлт цуцаллаа.");
      changeTab("OPEN");
      void fetchAll(user.id);
    } catch (e: any) {
      console.error(e);
      setError("Хүсэлт цуцлахад алдаа гарлаа.");
    } finally {
      setActLoading((p) => ({ ...p, [deliveryId]: false }));
    }
  }

  // ✅ ON_ROUTE → DELIVERED
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

      changeTab("DELIVERED");
      setMsg("Хүргэлтийг хүргэсэн гэж тэмдэглэлээ.");
      void fetchAll(user.id);
    } catch (e: any) {
      console.error(e);
      setError("Шинэчлэхэд алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setActLoading((p) => ({ ...p, [deliveryId]: false }));
    }
  }

  // ✅ DELIVERED дээр устгах (driver_hidden=true)
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

  // ---------------- UI ----------------
  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">INCOME</div>
            <h1 className="text-xl font-bold text-slate-900">Жолооч</h1>
            <div className="mt-1 text-xs text-slate-500">
              {user.name} · {user.phone}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/driver/profile")}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-slate-300"
            >
              Профайл
            </button>
          </div>
        </div>

        {/* tabs */}
        <div className="mt-5 flex flex-wrap gap-2">
          {DRIVER_TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => changeTab(t.id)}
                className={
                  active
                    ? "rounded-full bg-slate-900 text-white px-4 py-2 text-sm font-semibold"
                    : "rounded-full border border-slate-200 bg-white text-slate-700 px-4 py-2 text-sm font-semibold hover:border-slate-300"
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* status line */}
        <div className="mt-4 space-y-2">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          {msg && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {msg}
            </div>
          )}

          {activeTab === "ASSIGNED" && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
              Энэ таб дээрх хүргэлтүүдийг <span className="font-semibold">худалдагч</span> “Жолооч барааг авч явлаа” гэж
              тэмдэглэсний дараа л “Замд” таб руу шилжинэ.
            </div>
          )}

          {activeTab === "DELIVERED" && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
              “Хүргэсэн” таб дээрх хүргэлтүүдийг устгаж болно. (Зөвхөн танд харагдахгүй болгоно.)
            </div>
          )}
        </div>

        {/* list */}
        <div className="mt-4">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Ачаалж байна…</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              Энэ таб дээр хүргэлт алга.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filtered.map((d) => {
                const b = badge(d.status);
                const isMine = d.chosen_driver_id === user.id;
                const seller = isMine ? sellerMap[d.seller_id] : undefined;

                const fromArea = areaLine(d.pickup_district, d.pickup_khoroo);
                const toArea = areaLine(d.dropoff_district, d.dropoff_khoroo);

                return (
                  <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 w-full">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${b.cls}`}>
                            {b.text}
                          </span>
                          <span className="text-xs text-slate-500">{fmtDT(d.created_at)}</span>
                        </div>

                        {/* ✅ NEW: зөөлөн өнгийн 3 блок */}
                        <div className="mt-3 grid gap-2">
                          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                            <div className="text-[11px] text-emerald-900/70">Авах (хаанаас)</div>
                            <div className="mt-1 text-xs font-semibold text-slate-900">
                              {fromArea ? <span className="text-slate-700">{fromArea} · </span> : null}
                              {shorten(d.from_address, 90)}
                            </div>
                          </div>

                          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                            <div className="text-[11px] text-amber-900/70">Хүргэх (хаашаа)</div>
                            <div className="mt-1 text-xs font-semibold text-slate-900">
                              {toArea ? <span className="text-slate-700">{toArea} · </span> : null}
                              {shorten(d.to_address, 90)}
                            </div>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[11px] text-slate-500">Юу хүргэх</div>
                                <div className="mt-1 text-xs font-semibold text-slate-900">
                                  {d.note ? shorten(d.note, 120) : "—"}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-[11px] text-slate-500">Санал үнэ</div>
                                <div className="mt-1 text-sm font-extrabold text-slate-900">{fmtPrice(d.price_mnt)}</div>
                              </div>
                            </div>

                            {d.delivery_type ? (
                              <div className="mt-2">
                                <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                  {d.delivery_type}
                                </span>
                              </div>
                            ) : null}
                          </div>

                          {/* ✅ Seller info: зөвхөн өөрт оноогдсон үед */}
                          {isMine && d.status !== "OPEN" && (
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="text-[11px] text-slate-500">Худалдагч</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <div className="text-xs font-semibold text-slate-800">{seller?.name || "—"}</div>
                                {seller?.phone ? (
                                  <>
                                    <div className="text-xs text-slate-600">{seller.phone}</div>
                                    <a
                                      href={`tel:${seller.phone}`}
                                      className="ml-auto rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                                    >
                                      Залгах
                                    </a>
                                  </>
                                ) : (
                                  <div className="text-xs text-slate-500">Утас: —</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0">
                        <div className="text-xs text-slate-500 text-right">ID</div>
                        <div className="text-xs font-mono text-slate-600">{d.id.slice(0, 8)}…</div>
                      </div>
                    </div>

                    {/* actions */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {activeTab === "OPEN" && d.status === "OPEN" && (
                        <button
                          onClick={() => requestDelivery(d.id)}
                          disabled={!!actLoading[d.id]}
                          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          {actLoading[d.id] ? "Илгээж байна…" : "Авах хүсэлт"}
                        </button>
                      )}

                      {activeTab === "REQUESTS" && d.status === "OPEN" && (
                        <button
                          onClick={() => cancelRequest(d.id)}
                          disabled={!!actLoading[d.id]}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                        >
                          {actLoading[d.id] ? "Түр хүлээнэ үү…" : "Хүсэлт цуцлах"}
                        </button>
                      )}

                      {activeTab === "ON_ROUTE" && d.status === "ON_ROUTE" && isMine && (
                        <button
                          onClick={() => markDelivered(d.id)}
                          disabled={!!actLoading[d.id]}
                          className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                        >
                          {actLoading[d.id] ? "Түр хүлээнэ үү…" : "Хүргэсэн"}
                        </button>
                      )}

                      {activeTab === "DELIVERED" && isMine && (
                        <button
                          onClick={() => hideDelivered(d.id)}
                          disabled={!!actLoading[d.id]}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-slate-300 disabled:opacity-60"
                        >
                          {actLoading[d.id] ? "Түр хүлээнэ үү…" : "Устгах"}
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
                );
              })}
            </div>
          )}
        </div>

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
