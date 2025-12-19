"use client";

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

  pickup_district: string | null;
  pickup_khoroo: string | null;
  dropoff_district: string | null;
  dropoff_khoroo: string | null;

  status: DeliveryStatus;
  created_at: string;
  price_mnt: number | null;
  delivery_type: string | null;
  chosen_driver_id: string | null;

  seller_hidden: boolean;
  bid_count?: number;

  // ✅ шинэ: замд гарсан мөч
  on_route_at?: string | null;
};

function fmtPrice(n: number | null | undefined) {
  const v = Number(n || 0);
  return v ? `${v.toLocaleString("mn-MN")}₮` : "Үнэ тохиролцоно";
}

function shorten(s: string | null, max = 72) {
  if (!s) return "—";
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+$/, "") + "…";
}

function areaLine(district?: string | null, khoroo?: string | null) {
  const d = (district || "").trim();
  const k = (khoroo || "").trim();

  if (d && k) return `${d} · ${k}`;
  if (d) return d;
  if (k) return k;
  return "—";
}

function badge(status: DeliveryStatus) {
  switch (status) {
    case "OPEN":
      return {
        text: "Нээлттэй",
        cls: "border-emerald-200 bg-emerald-50/70 text-emerald-700",
      };
    case "ASSIGNED":
      return {
        text: "Сонгосон",
        cls: "border-indigo-200 bg-indigo-50 text-indigo-700",
      };
    case "ON_ROUTE":
      return {
        text: "Замд гарлаа",
        cls: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "DELIVERED":
    default:
      return {
        text: "Хүргэсэн",
        cls: "border-slate-200 bg-slate-50 text-slate-700",
      };
  }
}

function routeHours(onRouteAt?: string | null) {
  if (!onRouteAt) return 0;
  const t = new Date(onRouteAt).getTime();
  if (!Number.isFinite(t)) return 0;
  const ms = Date.now() - t;
  if (ms <= 0) return 0;
  return Math.floor(ms / 3600000); // ✅ 1 цагийн алхам
}

function Pill({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const base = "w-full rounded-xl border px-3 py-2 text-left transition-colors";
  const cls = active
    ? "border-emerald-200 bg-emerald-50/70"
    : "border-slate-200 bg-white hover:bg-slate-50";

  const Comp: any = onClick ? "button" : "div";

  return (
    <Comp onClick={onClick} className={`${base} ${cls}`}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-sm font-extrabold tracking-tight text-slate-900">
        {value}
      </div>
    </Comp>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function buildSharePostSimple(d: DeliveryRow) {
  const fromArea = areaLine(d.pickup_district, d.pickup_khoroo);
  const toArea = areaLine(d.dropoff_district, d.dropoff_khoroo);
  const price = fmtPrice(d.price_mnt);
  const what = d.note ? d.note.trim() : "";
  return (
    `🚚 Delivery\n` +
    `📍 ${fromArea} → ${toArea}\n` +
    `💰 ${price}\n` +
    (what ? `📦 ${what}\n` : "") +
    `#INCOME`
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

  // ✅ Таб нэрийг яг хүссэнээр солих (UI эвдэхгүйгээр)
  const SELLER_TABS_UI = useMemo(() => {
    return SELLER_TABS.map((t) =>
      t.id === "ON_ROUTE" ? { ...t, label: "Замд гарлаа" } : t
    );
  }, []);

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

  useEffect(() => {
    const urlTab = sp.get("tab");
    const valid = SELLER_TABS_UI.some((t) => t.id === (urlTab as any));
    if (urlTab && valid) {
      setActiveTab(urlTab as SellerTabId);
      localStorage.setItem("sellerActiveTab", urlTab);
      return;
    }
    const stored = localStorage.getItem("sellerActiveTab");
    const validStored = SELLER_TABS_UI.some((t) => t.id === (stored as any));
    if (stored && validStored) setActiveTab(stored as SellerTabId);
  }, [sp, SELLER_TABS_UI]);

  function changeTab(tab: SellerTabId) {
    setActiveTab(tab);
    localStorage.setItem("sellerActiveTab", tab);
    router.replace(`/seller?tab=${tab}`);
  }

  useEffect(() => {
    if (!user) return;
    void fetchAll(user.id);
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
          pickup_district,
          pickup_khoroo,
          dropoff_district,
          dropoff_khoroo,
          status,
          created_at,
          price_mnt,
          delivery_type,
          chosen_driver_id,
          seller_hidden,
          on_route_at
        `
        )
        .eq("seller_id", sellerId)
        .eq("seller_hidden", false)
        .order("created_at", { ascending: false });

      if (e1) throw e1;

      const rows = (data || []) as DeliveryRow[];

      const openIds = rows.filter((r) => r.status === "OPEN").map((r) => r.id);
      const bidMap: Record<string, number> = {};

      if (openIds.length) {
        const { data: bidRows, error: e2 } = await supabase
          .from("driver_bids")
          .select("delivery_id")
          .in("delivery_id", openIds);

        if (!e2) {
          for (const r of bidRows || []) {
            const k = (r as any).delivery_id as string;
            bidMap[k] = (bidMap[k] || 0) + 1;
          }
        }
      }

      setItems(
        rows.map((r) =>
          r.status === "OPEN" ? { ...r, bid_count: bidMap[r.id] || 0 } : r
        )
      );
    } catch (e: any) {
      setError(e?.message || "Алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return items.filter((d) => getSellerTabForStatus(d.status) === activeTab);
  }, [items, activeTab]);

  // ✅ ON_ROUTE үед: хамгийн удаж байгаа нь дээр (on_route_at хамгийн эрт)
  const sorted = useMemo(() => {
    if (activeTab !== "ON_ROUTE") return filtered;

    const copy = [...filtered];
    copy.sort((a, b) => {
      const ta = a.on_route_at ? new Date(a.on_route_at).getTime() : 0;
      const tb = b.on_route_at ? new Date(b.on_route_at).getTime() : 0;

      // on_route_at байхгүй нь доошоо
      if (!ta && tb) return 1;
      if (ta && !tb) return -1;

      return ta - tb;
    });
    return copy;
  }, [filtered, activeTab]);

  const tabCounts = useMemo(() => {
    const m: Record<SellerTabId, number> = {
      OPEN: 0,
      ASSIGNED: 0,
      ON_ROUTE: 0,
      DELIVERED: 0,
    };
    for (const d of items) {
      const tab = getSellerTabForStatus(d.status);
      m[tab] = (m[tab] || 0) + 1;
    }
    return m;
  }, [items]);

  function logout() {
    localStorage.removeItem("incomeUser");
    router.replace("/");
  }

  function lock(deliveryId: string, v: boolean) {
    setActLoading((prev) => ({ ...prev, [deliveryId]: v }));
  }

  function openDetail(d: DeliveryRow) {
    router.push(`/seller/delivery/${d.id}`);
  }

  async function markPickedUp(deliveryId: string) {
    if (!user) return;
    if (actLoading[deliveryId]) return;

    lock(deliveryId, true);
    setMsg(null);
    setError(null);

    try {
      const now = new Date().toISOString();

      // ✅ 1) статус + on_route_at нэг дор
      const { error: e1 } = await supabase
        .from("deliveries")
        .update({ status: "ON_ROUTE", on_route_at: now } as any)
        .eq("id", deliveryId)
        .eq("seller_id", user.id)
        .eq("status", "ASSIGNED");

      if (e1) throw e1;

      // ✅ optional: picked_up_at байхгүй байсан ч статус унахгүй
      try {
        await supabase
          .from("deliveries")
          .update({ picked_up_at: now } as any)
          .eq("id", deliveryId)
          .eq("seller_id", user.id);
      } catch {
        // ignore
      }

      setItems((prev) =>
        prev.map((x) =>
          x.id === deliveryId
            ? ({
                ...x,
                status: "ON_ROUTE",
                on_route_at: now,
              } as DeliveryRow)
            : x
        )
      );

      setMsg("Жолооч барааг авсан → Замд гарлаа руу шилжлээ.");
      changeTab("ON_ROUTE");

      await fetchAll(user.id);
    } catch (e: any) {
      setError(e?.message || "Алдаа гарлаа");
    } finally {
      lock(deliveryId, false);
    }
  }

  async function deleteDelivered(deliveryId: string) {
    if (!user) return;
    if (actLoading[deliveryId]) return;

    lock(deliveryId, true);
    setMsg(null);
    setError(null);

    try {
      const { error: e1 } = await supabase
        .from("deliveries")
        .update({ seller_hidden: true })
        .eq("id", deliveryId)
        .eq("seller_id", user.id);

      if (e1) throw e1;

      setMsg("Хүргэсэн хүргэлтийг устгалаа.");
      await fetchAll(user.id);
    } catch (e: any) {
      setError(e?.message || "Алдаа гарлаа");
    } finally {
      lock(deliveryId, false);
    }
  }

  async function shareFacebookOpenOnly(d: DeliveryRow) {
    try {
      setMsg(null);
      setError(null);

      const text = buildSharePostSimple(d);
      const ok = await copyText(text);

      if (ok)
        setMsg("📤 SHARE текстийг хууллаа. Facebook дээр paste хийгээд post хийгээрэй.");
      else setMsg(text);

      window.open(
        "https://www.facebook.com/sharer/sharer.php?u=https://income.mn",
        "_blank"
      );
    } catch (e: any) {
      setError(e?.message || "Шэр хийхэд алдаа гарлаа");
    }
  }

  // ✅ Найдваргүй жолооч
  async function markDriverUnreliable(deliveryId: string, driverId: string | null) {
    if (!user) return;
    if (!driverId) return;
    if (actLoading[deliveryId]) return;

    lock(deliveryId, true);
    setMsg(null);
    setError(null);

    try {
      // 1) block
      const { error: e1 } = await supabase.from("seller_blocked_drivers").insert({
        seller_id: user.id,
        driver_id: driverId,
        reason: "Найдваргүй",
      } as any);

      if (e1) throw e1;

      // 2) delivery-г буцааж OPEN болгоно (дахин driver сонгоно)
      const { error: e2 } = await supabase
        .from("deliveries")
        .update({
          status: "OPEN",
          chosen_driver_id: null,
          on_route_at: null,
        } as any)
        .eq("id", deliveryId)
        .eq("seller_id", user.id);

      if (e2) throw e2;

      setMsg("Жолоочийг найдваргүй гэж тэмдэглээд хүргэлтийг дахин нээлттэй болголоо.");
      await fetchAll(user.id);
      changeTab("OPEN");
    } catch (e: any) {
      setError(e?.message || "Алдаа гарлаа");
    } finally {
      lock(deliveryId, false);
    }
  }

  // ✅ OPEN card
  function OpenCard({ d }: { d: DeliveryRow }) {
    const b = badge(d.status);
    const fromArea = areaLine(d.pickup_district, d.pickup_khoroo);
    const toArea = areaLine(d.dropoff_district, d.dropoff_khoroo);

    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${b.cls}`}
              >
                {b.text}
              </span>

              {typeof d.bid_count === "number" && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  Санал: {d.bid_count}
                </span>
              )}
            </div>

            <div className="mt-2 text-sm font-semibold leading-snug">
              <span className="text-emerald-700">{fromArea}</span>
              <span className="mx-2 text-slate-400">→</span>
              <span className="text-emerald-900">{toArea}</span>
            </div>
          </div>

          <div className="shrink-0">
            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50/70 px-3 py-1 text-sm font-extrabold tracking-tight text-emerald-700">
              {fmtPrice(d.price_mnt)}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <button
            onClick={() => openDetail(d)}
            className="inline-flex w-full items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100/70"
            title="Дэлгэрэнгүй"
          >
            <span className="text-emerald-700">📦</span>
            <span className="min-w-0 truncate text-emerald-900">
              {d.note ? shorten(d.note, 90) : "—"}
            </span>
          </button>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            onClick={() => openDetail(d)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:border-slate-300"
            title="OPEN"
          >
            📂 OPEN
          </button>

          <button
            onClick={() => void shareFacebookOpenOnly(d)}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            title="SHARE"
          >
            📤 SHARE
          </button>
        </div>
      </div>
    );
  }

  function DeliveryCardNormal({ d }: { d: DeliveryRow }) {
    const b = badge(d.status);
    const fromArea = areaLine(d.pickup_district, d.pickup_khoroo);
    const toArea = areaLine(d.dropoff_district, d.dropoff_khoroo);

    const h = d.status === "ON_ROUTE" ? routeHours(d.on_route_at) : 0;
    const isLate = d.status === "ON_ROUTE" && h >= 3;

    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${b.cls}`}
              >
                {b.text}
              </span>

              {/* ✅ ON_ROUTE дээр цаг */}
              {d.status === "ON_ROUTE" && (
                <span
                  className={[
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-extrabold",
                    isLate
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-emerald-200 bg-emerald-50/70 text-emerald-700",
                  ].join(" ")}
                  title="Замд гарснаас хойш"
                >
                  ⏱ {h} цаг
                </span>
              )}
            </div>

            <div className="mt-2 text-sm font-semibold">
              <span className="text-emerald-700">{fromArea}</span>
              <span className="mx-2 text-slate-400">→</span>
              <span className="text-emerald-900">{toArea}</span>
            </div>

            <div className="mt-2 text-sm font-bold text-emerald-700">
              {fmtPrice(d.price_mnt)}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            <button
              onClick={() => openDetail(d)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-slate-300"
            >
              Дэлгэрэнгүй
            </button>

            {d.status === "ASSIGNED" && (
              <button
                onClick={() => void markPickedUp(d.id)}
                disabled={!!actLoading[d.id]}
                className={[
                  "rounded-xl px-4 py-2 text-sm font-semibold text-white",
                  actLoading[d.id]
                    ? "bg-emerald-400"
                    : "bg-emerald-600 hover:bg-emerald-700",
                ].join(" ")}
              >
                Жолооч барааг авч явлаа
              </button>
            )}

            {d.status === "DELIVERED" && (
              <button
                onClick={() => void deleteDelivered(d.id)}
                disabled={!!actLoading[d.id]}
                className={[
                  "rounded-xl px-4 py-2 text-sm font-semibold text-white",
                  actLoading[d.id]
                    ? "bg-slate-400"
                    : "bg-slate-900 hover:bg-slate-800",
                ].join(" ")}
              >
                Устгах
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-slate-500">
                INCOME · Seller
              </div>
              <div className="text-2xl font-extrabold tracking-tight text-slate-900">
                {user?.name || "—"}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push("/seller/new-delivery")}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                + Шинэ хүргэлт
              </button>

              <button
                onClick={logout}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300"
              >
                Гарах
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {msg && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-700">
              {msg}
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Pill
              label="Нээлттэй"
              value={String(tabCounts.OPEN)}
              active={activeTab === "OPEN"}
              onClick={() => changeTab("OPEN")}
            />
            <Pill
              label="Сонгосон"
              value={String(tabCounts.ASSIGNED)}
              active={activeTab === "ASSIGNED"}
              onClick={() => changeTab("ASSIGNED")}
            />
            <Pill
              label="Замд гарлаа"
              value={String(tabCounts.ON_ROUTE)}
              active={activeTab === "ON_ROUTE"}
              onClick={() => changeTab("ON_ROUTE")}
            />
            <Pill
              label="Хүргэсэн"
              value={String(tabCounts.DELIVERED)}
              active={activeTab === "DELIVERED"}
              onClick={() => changeTab("DELIVERED")}
            />
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Одоо:{" "}
            <span className="font-semibold text-slate-700">
              {SELLER_TABS_UI.find((t) => t.id === activeTab)?.label || "—"}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
            Ачаалж байна…
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
            Энэ таб дээр хүргэлт алга.
          </div>
        ) : (
          <div className="grid gap-3">
            {sorted.map((d) => {
              if (activeTab === "OPEN") return <OpenCard key={d.id} d={d} />;
              return <DeliveryCardNormal key={d.id} d={d} />;
            })}
          </div>
        )}
      </main>
    </div>
  );
}
