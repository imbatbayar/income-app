"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  SELLER_TABS,
  SellerTabId,
  getSellerTabForStatus,
} from "@/lib/deliveryLogic";
import type { IncomeUser } from "@/lib/types";
import type { DeliveryRowSeller } from "@/lib/deliveries";

import Pill from "@/app/seller/_components/Pill";
import OpenCard from "@/app/seller/_components/OpenCard";
import DeliveryCardNormal from "@/app/seller/_components/DeliveryCardNormal";

import { buildSharePostSimple, copyText } from "@/app/seller/_lib/sellerUtils";

export default function SellerDashboardPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [user, setUser] = useState<IncomeUser | null>(null);
  const [activeTab, setActiveTab] = useState<SellerTabId>("OPEN");

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DeliveryRowSeller[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [actLoading, setActLoading] = useState<Record<string, boolean>>({});

  // ✅ ON_ROUTE үед амьд тоолуур шинэчлүүлэх tick
  const [tick, setTick] = useState(0);

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

  // ✅ зөвхөн ON_ROUTE таб дээр 30 сек тутам амьд тоологдох re-render
  useEffect(() => {
    if (activeTab !== "ON_ROUTE") return;
    const t = setInterval(() => setTick((v) => v + 1), 30 * 1000);
    return () => clearInterval(t);
  }, [activeTab]);

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

          pickup_lat,
          pickup_lng,
          dropoff_lat,
          dropoff_lng,

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

      const rows = (data || []) as DeliveryRowSeller[];

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

  // ✅ sort:
  // - ON_ROUTE: удаан нь дээр (on_route_at хамгийн эрт)
  // - DELIVERED tab: "Хүргэсэн"(DELIVERED) дээр, "Төлсөн"(PAID) доор
  const sorted = useMemo(() => {
    // tick ашигласнаар ON_ROUTE дээр хугацаа амьд шинэчлэгдэнэ
    if (activeTab === "ON_ROUTE") {
      const copy = [...filtered];
      copy.sort((a, b) => {
        const ta = a.on_route_at ? new Date(a.on_route_at).getTime() : 0;
        const tb = b.on_route_at ? new Date(b.on_route_at).getTime() : 0;

        if (!ta && tb) return 1;
        if (ta && !tb) return -1;

        return ta - tb;
      });
      return copy;
    }

    // ✅ DELIVERED таб дээр: PAID нь доор орно
    if (activeTab === "DELIVERED") {
      const rank = (s: any) => (s === "PAID" ? 1 : 0); // DELIVERED=0, PAID=1
      const copy = [...filtered];
      copy.sort((a, b) => {
        const ra = rank(a.status);
        const rb = rank(b.status);
        if (ra !== rb) return ra - rb;

        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
      return copy;
    }

    return filtered;
  }, [filtered, activeTab, tick]);

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

  function openDetail(d: DeliveryRowSeller) {
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
              } as DeliveryRowSeller)
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

  async function shareFacebookOpenOnly(d: DeliveryRowSeller) {
    try {
      setMsg(null);
      setError(null);

      const text = buildSharePostSimple(d);
      const ok = await copyText(text);

      if (ok)
        setMsg(
          "📤 SHARE текстийг хууллаа. Facebook дээр paste хийгээд post хийгээрэй."
        );
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

      setMsg(
        "Жолоочийг найдваргүй гэж тэмдэглээд хүргэлтийг дахин нээлттэй болголоо."
      );
      await fetchAll(user.id);
      changeTab("OPEN");
    } catch (e: any) {
      setError(e?.message || "Алдаа гарлаа");
    } finally {
      lock(deliveryId, false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            {/* ❌ INCOME · Seller + нэрийг харуулахгүй */}
            <div />

            <div className="flex items-center gap-2">
              {/* ✅ “Шинэ хүргэлт” хэвээр үлдээнэ */}
              <button
                onClick={() => router.push("/seller/new-delivery")}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                + Шинэ хүргэлт
              </button>

              {/* ❌ “Гарах” харагдуулахгүй (логик нь хэвээр) */}
              <button
                onClick={logout}
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
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
              if (activeTab === "OPEN") {
                return (
                  <OpenCard
                    key={d.id}
                    d={d}
                    onOpenDetail={openDetail}
                    onToast={(t) => setMsg(t)}
                  />
                );
              }

              return (
                <DeliveryCardNormal
                  key={d.id}
                  d={d}
                  actLoading={actLoading}
                  onOpenDetail={openDetail}
                  onMarkPickedUp={(id) => void markPickedUp(id)}
                  onDeleteDelivered={(id) => void deleteDelivered(id)}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
