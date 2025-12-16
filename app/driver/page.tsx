"use client";

/* ===========================
 * app/driver/page.tsx (FINAL v6.0)
 *
 * ✅ NEW FLOW (BABA rule):
 * - ASSIGNED -> ON_ROUTE : SELLER тал "Жолооч барааг авч явлаа" дарна
 *   → Driver тал ASSIGNED дээр ямар ч товч байхгүй (зөвхөн харах)
 *
 * Driver actions:
 * - OPEN: "Авах хүсэлт"
 * - REQUESTS: "Хүсэлт цуцлах"
 * - ON_ROUTE: "Хүргэсэн" (DELIVERED)
 * - PAID: "Төлбөр хүлээн авсан" (CLOSED)
 *
 * ⚠ Privacy:
 * - Энэ list page дээр buyer-н нарийн хаяг/утас огт харуулахгүй.
 *   (Private info-г зөвхөн /driver/delivery/[id] дээр ON_ROUTE+ үед chosen driver-т харуулна)
 * =========================== */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  DeliveryStatus,
  DRIVER_TABS,
  DriverTabId,
  canDriverConfirmPayment,
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

function shorten(s: string | null, n = 60) {
  const t = String(s || "").trim();
  if (!t) return "";
  if (t.length <= n) return t;
  return t.slice(0, n).replace(/\s+$/, "") + "…";
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

export default function DriverPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [user, setUser] = useState<IncomeUser | null>(null);
  const [activeTab, setActiveTab] = useState<DriverTabId>("OPEN");

  const [items, setItems] = useState<DeliveryRow[]>([]);
  const [myBids, setMyBids] = useState<BidLite[]>([]);

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

  async function fetchAll(driverId: string) {
    setLoading(true);
    setError(null);

    try {
      // 1) deliveries (exclude hidden)
      const { data: d1, error: e1 } = await supabase
        .from("deliveries")
        .select(
          "id,seller_id,from_address,to_address,note,status,created_at,price_mnt,delivery_type,chosen_driver_id,seller_marked_paid,driver_confirmed_payment,dispute_opened_at,closed_at,driver_hidden"
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

      setItems((d1 || []) as DeliveryRow[]);
      setMyBids((b1 || []) as BidLite[]);
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
      if (activeTab === "DELIVERED") return d.status === "DELIVERED" && d.chosen_driver_id === user.id;
      if (activeTab === "PAID") return d.status === "PAID" && d.chosen_driver_id === user.id;
      if (activeTab === "CLOSED") return d.status === "CLOSED" && d.chosen_driver_id === user.id;
      if (activeTab === "DISPUTE") return d.status === "DISPUTE" && d.chosen_driver_id === user.id;

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

      if (!data || data.status !== "DELIVERED") {
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

  // ✅ PAID → CLOSED
  async function confirmPaymentReceived(deliveryId: string) {
    if (!user) return;
    if (actLoading[deliveryId]) return;

    setActLoading((p) => ({ ...p, [deliveryId]: true }));
    setError(null);
    setMsg(null);

    try {
      const cur = items.find((x) => x.id === deliveryId);
      if (!cur) return;

      const ok = canDriverConfirmPayment({
        status: cur.status,
        driver_confirmed_payment: !!cur.driver_confirmed_payment,
      });

      const isMine = cur.chosen_driver_id === user.id;

      if (!ok || !isMine) {
        setError("Зөвхөн 'Төлсөн' үед төлбөр хүлээн авснаа батална.");
        return;
      }

      const closedAt = new Date().toISOString();

      const { data, error: e1 } = await supabase
        .from("deliveries")
        .update({
          driver_confirmed_payment: true,
          status: "CLOSED",
          closed_at: closedAt,
        })
        .eq("id", deliveryId)
        .eq("chosen_driver_id", user.id)
        .eq("status", "PAID")
        .eq("driver_confirmed_payment", false)
        .select("id,status,driver_confirmed_payment,closed_at")
        .maybeSingle();

      if (e1) throw e1;

      if (!data || data.status !== "CLOSED") {
        setError("Шилжилт амжилтгүй. (PAID→CLOSED) Дахин оролдоно уу.");
        return;
      }

      setItems((prev) =>
        prev.map((x) =>
          x.id === deliveryId
            ? {
                ...x,
                status: "CLOSED" as any,
                driver_confirmed_payment: true,
                closed_at: (data as any).closed_at ?? closedAt,
              }
            : x
        )
      );

      changeTab("CLOSED");
      setMsg("Төлбөр хүлээн авснаа баталлаа.");
      void fetchAll(user.id);
    } catch (e: any) {
      console.error(e);
      setError("Төлбөр батлахад алдаа гарлаа.");
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
            <div className="text-xs text-slate-500 mt-1">
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

          {/* ASSIGNED info note (new rule) */}
          {activeTab === "ASSIGNED" && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
              Энэ таб дээрх хүргэлтүүдийг <span className="font-semibold">худалдагч</span> “Жолооч барааг авч явлаа”
              гэж тэмдэглэсний дараа л “Замд” таб руу шилжинэ. Жолооч эндээс товч дарахгүй.
            </div>
          )}
        </div>

        {/* list */}
        <div className="mt-4">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              Ачаалж байна…
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              Энэ таб дээр хүргэлт алга.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filtered.map((d) => {
                const b = badge(d.status);
                const isMine = d.chosen_driver_id === user.id;

                return (
                  <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${b.cls}`}>
                            {b.text}
                          </span>
                          <span className="text-xs text-slate-500">{fmtDT(d.created_at)}</span>
                        </div>

                        <div className="mt-2 text-sm font-semibold text-slate-900">
                          {shorten(d.from_address, 80)} → {shorten(d.to_address, 80)}
                        </div>

                        {d.note && <div className="mt-1 text-xs text-slate-600">{shorten(d.note, 120)}</div>}

                        <div className="mt-2 text-sm font-bold text-slate-900">{fmtPrice(d.price_mnt)}</div>
                      </div>

                      <div className="shrink-0">
                        <div className="text-xs text-slate-500 text-right">ID</div>
                        <div className="text-xs font-mono text-slate-600">{d.id.slice(0, 8)}…</div>
                      </div>
                    </div>

                    {/* actions */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {/* OPEN: request */}
                      {activeTab === "OPEN" && d.status === "OPEN" && (
                        <button
                          onClick={() => requestDelivery(d.id)}
                          disabled={!!actLoading[d.id]}
                          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          {actLoading[d.id] ? "Илгээж байна…" : "Авах хүсэлт"}
                        </button>
                      )}

                      {/* REQUESTS: cancel request */}
                      {activeTab === "REQUESTS" && d.status === "OPEN" && (
                        <button
                          onClick={() => cancelRequest(d.id)}
                          disabled={!!actLoading[d.id]}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                        >
                          {actLoading[d.id] ? "Түр хүлээнэ үү…" : "Хүсэлт цуцлах"}
                        </button>
                      )}

                      {/* ✅ ASSIGNED: NO ACTION (seller marks ON_ROUTE) */}
                      {activeTab === "ASSIGNED" && d.status === "ASSIGNED" && isMine && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          Худалдагч “Жолооч барааг авч явлаа” гэж тэмдэглэсний дараа үргэлжилнэ.
                        </div>
                      )}

                      {/* ON_ROUTE: mark delivered */}
                      {activeTab === "ON_ROUTE" && d.status === "ON_ROUTE" && isMine && (
                        <button
                          onClick={() => markDelivered(d.id)}
                          disabled={!!actLoading[d.id]}
                          className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                        >
                          {actLoading[d.id] ? "Түр хүлээнэ үү…" : "Хүргэсэн"}
                        </button>
                      )}

                      {/* PAID: confirm payment received */}
                      {activeTab === "PAID" && d.status === "PAID" && isMine && !d.driver_confirmed_payment && (
                        <button
                          onClick={() => confirmPaymentReceived(d.id)}
                          disabled={!!actLoading[d.id]}
                          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {actLoading[d.id] ? "Баталж байна…" : "Төлбөр хүлээн авсан"}
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
