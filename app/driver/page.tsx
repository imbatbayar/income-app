// app/driver/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Role = "seller" | "driver";

type IncomeUser = {
  id: string;
  role: Role;
  name: string;
  phone: string;
  email: string;
};

type DeliveryStatus =
  | "OPEN"
  | "ASSIGNED"
  | "PICKED_UP"
  | "DELIVERED"
  | "CLOSED"     // шинэ - бүрэн хаагдсан
  | "CANCELLED"
  | "DISPUTE"
  | "RETURNED";

type Delivery = {
  id: string;
  seller_id: string;
  from_address: string | null;
  to_address: string | null;
  receiver_phone: string | null;
  note: string | null;
  status: DeliveryStatus;
  created_at: string;
  price_mnt: number | null;
  delivery_type: string | null;
  chosen_driver_id: string | null;
};

type BidRow = {
  delivery_id: string;
};

type TabKey = "open" | "mine" | "done" | "returned";

function typeLabel(
  deliveryType: string | null
): { icon: string; label: string } {
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
        text: "Сонгогдсон",
        className: "bg-sky-50 text-sky-700 border-sky-100",
      };
    case "PICKED_UP":
      return {
        text: "Замд",
        className: "bg-indigo-50 text-indigo-700 border-indigo-100",
      };
    case "DELIVERED":
      return {
        text: "Хүргэсэн",
        className: "bg-slate-900 text-white border-slate-900",
      };
    case "CANCELLED":
      return {
        text: "Буцаасан",
        className: "bg-rose-50 text-rose-700 border-rose-100",
      };
    default:
      return {
        text: status,
        className: "bg-slate-50 text-slate-600 border-slate-100",
      };
  }
}

function shorten(addr: string | null, max = 60) {
  if (!addr) return "Хаяг тодорхойгүй";
  const s = addr.trim();
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+$/, "") + "…";
}

export default function DriverDashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<IncomeUser | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [requestedIds, setRequestedIds] = useState<string[]>([]);

  const [activeTab, setActiveTab] = useState<TabKey>("open");

  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingAll, setLoadingAll] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1) Жолооч шалгах
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("incomeUser");
      if (!raw) {
        router.replace("/");
        return;
      }

      const parsed: IncomeUser = JSON.parse(raw);

      if (parsed.role !== "driver") {
        router.replace("/seller");
        return;
      }

      setUser(parsed);
      setLoadingUser(false);
    } catch (e) {
      console.error(e);
      setError("Хэрэглэгчийн мэдээлэл уншихад алдаа гарлаа.");
      setLoadingUser(false);
    }
  }, [router]);

  // 2) Хүргэлтүүд + өөрийн гаргасан хүсэлтүүд
  useEffect(() => {
    if (!user) return;
    void fetchAll(user.id);
  }, [user]);

  async function fetchAll(driverId: string) {
    try {
      setLoadingAll(true);
      setError(null);

      // a) Нээлттэй бүх хүргэлт
      const { data: openData, error: openErr } = await supabase
        .from("deliveries")
        .select(
          "id, seller_id, from_address, to_address, receiver_phone, note, status, created_at, price_mnt, delivery_type, chosen_driver_id"
        )
        .eq("status", "OPEN")
        .order("created_at", { ascending: false });

      if (openErr) throw openErr;

      // b) Миний хүргэлтүүд (OPEN-оос бусад)
      const { data: mineData, error: mineErr } = await supabase
        .from("deliveries")
        .select(
          "id, seller_id, from_address, to_address, receiver_phone, note, status, created_at, price_mnt, delivery_type, chosen_driver_id"
        )
        .neq("status", "OPEN")
        .eq("chosen_driver_id", driverId)
        .order("created_at", { ascending: false });

      if (mineErr) throw mineErr;

      const allList = [
        ...((openData || []) as Delivery[]),
        ...((mineData || []) as Delivery[]),
      ];

      setDeliveries(allList);

      // c) Энэ жолоочийн гаргасан бүх хүсэлт
      const { data: bids, error: bidsErr } = await supabase
        .from("driver_bids")
        .select("delivery_id")
        .eq("driver_id", driverId);

      if (bidsErr) {
        console.error(bidsErr);
        setRequestedIds([]);
      } else {
        const ids = (bids || []).map((b: BidRow) => b.delivery_id);
        setRequestedIds(ids);
      }
    } catch (e) {
      console.error(e);
      setError("Хүргэлтүүдийг татахад алдаа гарлаа.");
      setDeliveries([]);
      setRequestedIds([]);
    } finally {
      setLoadingAll(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem("incomeUser");
    router.push("/");
  }

  function goDetail(id: string) {
    router.push(`/driver/delivery/${id}`);
  }

  if (loadingUser || loadingAll) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Ачаалж байна…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Нэвтрээгүй байна.</div>
      </div>
    );
  }

  // --------- Хуваалт / табуудын өгөгдөл ---------
  const requestedSet = new Set(requestedIds);

  const openAll = deliveries.filter((d) => d.status === "OPEN");
  const openActive = openAll.filter((d) => !requestedSet.has(d.id));
  const openRequested = openAll.filter((d) => requestedSet.has(d.id));
  const orderedOpen = [...openActive, ...openRequested];

  const myAll = deliveries.filter(
    (d) => d.chosen_driver_id === user.id && d.status !== "OPEN"
  );
  const myCurrent = myAll.filter(
    (d) => d.status === "ASSIGNED" || d.status === "PICKED_UP"
  );
  const myDone = myAll.filter((d) => d.status === "DELIVERED");
  const myReturned = myAll.filter((d) => d.status === "CANCELLED");

  // --------- Карт – seller талын хэв маягийг ашиглав ---------
  function renderCard(d: Delivery, opts?: { dimRequested?: boolean }) {
    const isRequested = opts?.dimRequested ?? false;

    const baseBadge = statusBadge(d.status);
    const badge =
      isRequested && d.status === "OPEN"
        ? {
            text: "Хүсэлт илгээсэн",
            className: "bg-amber-50 text-amber-700 border-amber-100",
          }
        : baseBadge;

    const created = new Date(d.created_at).toLocaleString("mn-MN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <div
        key={d.id}
        className={`rounded-2xl bg-white border px-4 py-3 flex flex-col gap-2 shadow-xs ${
          isRequested ? "opacity-60" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">
              {typeLabel(d.delivery_type).icon}{" "}
              {typeLabel(d.delivery_type).label}
            </span>
            {d.price_mnt != null && (
              <span className="text-sm font-semibold text-slate-900">
                – {d.price_mnt.toLocaleString("mn-MN")}₮
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] ${badge.className}`}
            >
              {badge.text}
            </span>
            <span className="text-[11px] text-slate-400">{created}</span>
          </div>
        </div>

        {/* 👇 Худалдагч талынхтай ижил pill-үүд */}
        <div className="space-y-0.5 mt-1">
          <div className="text-[11px] flex gap-2">
            <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px]">
              Хаанаас
            </span>
            <span className="text-[11px] text-slate-700">
              {shorten(d.from_address)}
            </span>
          </div>

          <div className="text-[11px] flex gap-2">
            <span className="inline-flex px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px]">
              Хаашаа
            </span>
            <span className="text-[11px] text-slate-700">
              {shorten(d.to_address)}
            </span>
          </div>

          {d.note && (
            <div className="text-[11px] flex gap-2">
              <span className="inline-flex px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 text-[10px]">
                Юу
              </span>
              <span className="text-[11px] text-slate-700">{d.note}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-2">
          <div className="text-[11px] text-slate-600">
            Дэлгэрэнгүйг нээж Maps, утас, бусад мэдээллээ харна.
          </div>

          <button
            onClick={() => goDetail(d.id)}
            className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            Дэлгэрэнгүй
          </button>
        </div>
      </div>
    );
  }

  function renderContent() {
    if (activeTab === "open") {
      return (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Нээлттэй хүргэлтүүд
          </h2>
          {orderedOpen.length === 0 ? (
            <div className="text-[11px] text-slate-500">
              Нээлттэй хүргэлт одоогоор алга.
            </div>
          ) : (
            <div className="space-y-3">
              {orderedOpen.map((d) =>
                renderCard(d, {
                  dimRequested: requestedSet.has(d.id),
                })
              )}
            </div>
          )}
        </section>
      );
    }

    if (activeTab === "mine") {
      return (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Миний хүргэлтүүд
          </h2>
          {myCurrent.length === 0 ? (
            <div className="text-[11px] text-slate-500">
              Танд оноосон идэвхтэй хүргэлт одоогоор алга.
            </div>
          ) : (
            <div className="space-y-3">{myCurrent.map((d) => renderCard(d))}</div>
          )}
        </section>
      );
    }

    if (activeTab === "done") {
      return (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">Хүргэсэн</h2>
          {myDone.length === 0 ? (
            <div className="text-[11px] text-slate-500">
              Хүргэсэн хүргэлтийн архив алга.
            </div>
          ) : (
            <div className="space-y-3">{myDone.map((d) => renderCard(d))}</div>
          )}
        </section>
      );
    }

    // returned
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Буцаасан</h2>
        {myReturned.length === 0 ? (
          <div className="text-[11px] text-slate-500">
            Буцаасан хүргэлтийн бүртгэл одоогоор алга.
          </div>
        ) : (
          <div className="space-y-3">
            {myReturned.map((d) => renderCard(d))}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center rounded-full bg-emerald-50 px-3 py-1">
              <span className="text-xs font-semibold text-emerald-700">
                INCOME
              </span>
            </div>

            <div>
              <h1 className="text-sm font-semibold text-slate-900">
                Жолоочийн самбар
              </h1>
              <p className="text-xs text-slate-500">
                Нээлттэй хүргэлтээс сонгож, өөрт оноосон хүргэлтүүдээ хяна.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium text-slate-900">
                {user.name}
              </div>
              <div className="text-xs text-slate-500">{user.phone}</div>
            </div>

            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Гарах
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Tabs */}
        <div className="inline-flex rounded-full bg-slate-100 p-1 text-[11px]">
          <button
            onClick={() => setActiveTab("open")}
            className={`px-3 py-1.5 rounded-full ${
              activeTab === "open"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500"
            }`}
          >
            Нээлттэй
          </button>
          <button
            onClick={() => setActiveTab("mine")}
            className={`px-3 py-1.5 rounded-full ${
              activeTab === "mine"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500"
            }`}
          >
            Миний хүргэлт
          </button>
          <button
            onClick={() => setActiveTab("done")}
            className={`px-3 py-1.5 rounded-full ${
              activeTab === "done"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500"
            }`}
          >
            Хүргэсэн
          </button>
          <button
            onClick={() => setActiveTab("returned")}
            className={`px-3 py-1.5 rounded-full ${
              activeTab === "returned"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500"
            }`}
          >
            Буцаасан
          </button>
        </div>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {renderContent()}
      </main>
    </div>
  );
}
