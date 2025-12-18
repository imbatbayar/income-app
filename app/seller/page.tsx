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

  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;

  status: DeliveryStatus;
  created_at: string;
  price_mnt: number | null;
  delivery_type: string | null;
  chosen_driver_id: string | null;

  seller_hidden: boolean;
  bid_count?: number;
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

function badge(status: DeliveryStatus) {
  switch (status) {
    case "OPEN":
      return { text: "Нээлттэй", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" };
    case "ASSIGNED":
      return { text: "Сонгосон", cls: "bg-sky-50 text-sky-700 border-sky-100" };
    case "ON_ROUTE":
      return { text: "Замд", cls: "bg-indigo-50 text-indigo-700 border-indigo-100" };
    case "DELIVERED":
      return { text: "Хүргэсэн", cls: "bg-amber-50 text-amber-700 border-amber-100" };
    default:
      return { text: status, cls: "bg-slate-50 text-slate-700 border-slate-200" };
  }
}

function filterByTab(tab: SellerTabId, items: DeliveryRow[]) {
  return items.filter((d) => getSellerTabForStatus(d.status) === tab);
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function buildGoogleMapsRouteLink(d: DeliveryRow) {
  const pLat = d.pickup_lat;
  const pLng = d.pickup_lng;
  const dLat = d.dropoff_lat;
  const dLng = d.dropoff_lng;

  if (
    pLat != null &&
    pLng != null &&
    dLat != null &&
    dLng != null &&
    Number.isFinite(Number(pLat)) &&
    Number.isFinite(Number(pLng)) &&
    Number.isFinite(Number(dLat)) &&
    Number.isFinite(Number(dLng))
  ) {
    const origin = `${pLat},${pLng}`;
    const dest = `${dLat},${dLng}`;
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`;
  }

  // координат байхгүй үед fallback
  const from = d.from_address ? encodeURIComponent(d.from_address) : "";
  const to = d.to_address ? encodeURIComponent(d.to_address) : "";
  if (from && to) {
    return `https://www.google.com/maps/dir/?api=1&origin=${from}&destination=${to}`;
  }
  return "https://www.google.com/maps";
}

function buildSharePost(d: DeliveryRow) {
  const from = d.from_address || "—";
  const to = d.to_address || "—";
  const price = fmtPrice(d.price_mnt);
  const what = d.note ? d.note.trim() : "";
  const mapLink = buildGoogleMapsRouteLink(d);

  return (
    `🚚 Хүргэлт хэрэгтэй байна\n` +
    `📍 ${from} → ${to}\n` +
    `💰 ${price}\n` +
    (what ? `📦 ${what}\n` : "") +
    `🗺️ ${mapLink}\n` +
    `#INCOME`
  );
}

async function shareFacebookOpenOnly(d: DeliveryRow, setMsg: (s: string | null) => void, setError: (s: string | null) => void) {
  const text = buildSharePost(d);

  // 1) copy
  const ok = await copyText(text);
  if (ok) setMsg("Пост текст хууллаа. Facebook дээр paste хийгээд post хийгээрэй.");
  else setError("Clipboard зөвшөөрөлгүй байна. (Хуулах боломжгүй)");

  // 2) open FB share dialog (text quote-той)
  try {
    const u = encodeURIComponent(buildGoogleMapsRouteLink(d));
    const quote = encodeURIComponent(text);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${quote}`, "_blank");
  } catch {}
}

function Pill({
  label,
  value,
  accent = "slate",
}: {
  label: string;
  value: string;
  accent?: "emerald" | "sky" | "indigo" | "amber" | "slate";
}) {
  const acc =
    accent === "emerald"
      ? "bg-emerald-50 border-emerald-100 text-emerald-800"
      : accent === "sky"
      ? "bg-sky-50 border-sky-100 text-sky-800"
      : accent === "indigo"
      ? "bg-indigo-50 border-indigo-100 text-indigo-800"
      : accent === "amber"
      ? "bg-amber-50 border-amber-100 text-amber-800"
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
          pickup_lat,
          pickup_lng,
          dropoff_lat,
          dropoff_lng,
          status,
          created_at,
          price_mnt,
          delivery_type,
          chosen_driver_id,
          seller_hidden
        `
        )
        .eq("seller_id", sellerId)
        .eq("seller_hidden", false)
        .order("created_at", { ascending: false });

      if (e1) throw e1;

      const rows = (data || []) as DeliveryRow[];

      const ids = rows.map((r) => r.id);
      if (ids.length) {
        const { data: bids, error: e2 } = await supabase
          .from("driver_bids")
          .select("delivery_id")
          .in("delivery_id", ids);

        if (!e2 && bids) {
          const map: Record<string, number> = {};
          for (const b of bids as any[]) map[b.delivery_id] = (map[b.delivery_id] || 0) + 1;
          for (const r of rows) r.bid_count = map[r.id] || 0;
        }
      }

      setItems(rows);
    } catch (e: any) {
      setError(e?.message || "Алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  }

  const tabCounts = useMemo(() => {
    const c: Record<SellerTabId, number> = { OPEN: 0, ASSIGNED: 0, ON_ROUTE: 0, DELIVERED: 0 };
    for (const d of items) {
      const t = getSellerTabForStatus(d.status);
      c[t] = (c[t] || 0) + 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => filterByTab(activeTab, items), [activeTab, items]);

  function logout() {
    localStorage.removeItem("incomeUser");
    router.replace("/");
  }

  function openDetail(d: DeliveryRow) {
    router.push(`/seller/delivery/${d.id}?tab=${activeTab}`);
  }

  function lock(id: string, on: boolean) {
    setActLoading((p) => ({ ...p, [id]: on }));
  }

  // ✅ ASSIGNED -> ON_ROUTE (Seller товч)
  async function markPickedUp(deliveryId: string) {
    if (!user) return;
    if (actLoading[deliveryId]) return;

    lock(deliveryId, true);
    setMsg(null);
    setError(null);

    try {
      const now = new Date().toISOString();

      const { error: e1 } = await supabase
        .from("deliveries")
        .update({ status: "ON_ROUTE", picked_up_at: now })
        .eq("id", deliveryId)
        .eq("seller_id", user.id)
        .eq("status", "ASSIGNED");

      if (e1) throw e1;

      setMsg("Жолооч барааг авсан → Замд руу шилжлээ.");
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

  function OpenCardSimple({ d }: { d: DeliveryRow }) {
    const b = badge(d.status);
    const isOpenTab = activeTab === "OPEN";

    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${b.cls}`}>
                {b.text}
              </span>
              {typeof d.bid_count === "number" && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  Санал: {d.bid_count}
                </span>
              )}
            </div>

            <div className="mt-2 text-sm font-semibold text-slate-900">
              {shorten(d.from_address, 92)} → {shorten(d.to_address, 92)}
            </div>

            {d.note ? <div className="mt-1 text-xs text-slate-600">{shorten(d.note, 120)}</div> : null}
          </div>

          <div className="shrink-0 text-right">
            <div className="text-sm font-bold text-slate-900">{fmtPrice(d.price_mnt)}</div>

            <div className="mt-2 flex flex-col gap-2">
              <button
                onClick={() => openDetail(d)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Дэлгэрэнгүй
              </button>

              {/* ✅ Share зөвхөн Seller OPEN таб дээр */}
              {isOpenTab && (
                <button
                  onClick={() => void shareFacebookOpenOnly(d, setMsg, setError)}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  title="Зөвхөн OPEN таб дээр"
                >
                  Facebook-д шэр
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function DeliveryCardNormal({ d }: { d: DeliveryRow }) {
    const b = badge(d.status);

    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${b.cls}`}>
                {b.text}
              </span>
            </div>

            <div className="mt-2 text-sm font-semibold text-slate-900">
              {shorten(d.from_address, 92)} → {shorten(d.to_address, 92)}
            </div>

            {d.note ? <div className="mt-1 text-xs text-slate-600">{shorten(d.note, 130)}</div> : null}

            <div className="mt-2 text-sm font-bold text-slate-900">{fmtPrice(d.price_mnt)}</div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            <button
              onClick={() => openDetail(d)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-slate-300"
            >
              Дэлгэрэнгүй
            </button>

            {/* ✅ Алга болсон товчийг буцаав */}
            {d.status === "ASSIGNED" && (
              <button
                onClick={() => void markPickedUp(d.id)}
                disabled={!!actLoading[d.id]}
                className={[
                  "rounded-xl px-4 py-2 text-sm font-semibold text-white",
                  actLoading[d.id] ? "bg-slate-400" : "bg-indigo-600 hover:bg-indigo-700",
                ].join(" ")}
              >
                Жолооч барааг авч явлаа
              </button>
            )}

            {activeTab === "DELIVERED" && (
              <button
                onClick={() => void deleteDelivered(d.id)}
                disabled={!!actLoading[d.id]}
                className={[
                  "rounded-xl px-4 py-2 text-sm font-semibold text-white",
                  actLoading[d.id] ? "bg-slate-400" : "bg-rose-600 hover:bg-rose-700",
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
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs text-slate-500">INCOME · Seller</div>
            <div className="text-xl font-bold text-slate-900">{user?.name || "Худалдагч"}</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/seller/new-delivery")}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              + Шинэ хүргэлт
            </button>
            <button
              onClick={logout}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Гарах
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        {msg && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {msg}
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Pill label="Нээлттэй" value={String(tabCounts.OPEN)} accent="emerald" />
          <Pill label="Сонгосон" value={String(tabCounts.ASSIGNED)} accent="sky" />
          <Pill label="Замд" value={String(tabCounts.ON_ROUTE)} accent="indigo" />
          <Pill label="Хүргэсэн" value={String(tabCounts.DELIVERED)} accent="amber" />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {SELLER_TABS.map((t) => {
            const isActive = t.id === activeTab;
            const count = tabCounts[t.id] || 0;
            return (
              <button
                key={t.id}
                onClick={() => changeTab(t.id)}
                className={
                  isActive
                    ? "rounded-full bg-slate-900 text-white px-4 py-2 text-sm font-semibold"
                    : "rounded-full border border-slate-200 bg-white text-slate-700 px-4 py-2 text-sm font-semibold hover:border-slate-300"
                }
              >
                {t.label} <span className={isActive ? "opacity-80" : "text-slate-400"}>({count})</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
              Ачааллаж байна…
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
              Энэ таб дээр хүргэлт алга.
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((d) => {
                if (activeTab === "OPEN") return <OpenCardSimple key={d.id} d={d} />;
                return <DeliveryCardNormal key={d.id} d={d} />;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
