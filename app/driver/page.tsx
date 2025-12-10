"use client";

// =================== 1. Импорт, төрлүүд ===================

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  | "RETURNED"
  | "CLOSED"
  | "CANCELLED"
  | "DISPUTE";

type DriverTabId =
  | "OPEN"
  | "ASSIGNED"
  | "PICKED_UP"
  | "DELIVERED"
  | "RETURNED"
  | "CLOSED"
  | "DISPUTE";

type DeliveryRow = {
  id: string;
  from_address: string | null;
  to_address: string | null;
  note: string | null;
  status: DeliveryStatus;
  created_at: string;
  price_mnt: number | null;
  delivery_type: string | null;
  seller_marked_paid: boolean;
  driver_confirmed_payment: boolean;
  chosen_driver_id: string | null;

  // Жолооч энэ хүргэлт дээр хүсэлт илгээсэн эсэх
  hasBid: boolean;
};

// Драйверийн табууд
const DRIVER_TABS: { id: DriverTabId; label: string }[] = [
  { id: "OPEN",      label: "Нээлттэй" },
  { id: "ASSIGNED",  label: "Намайг сонгосон" },
  { id: "PICKED_UP", label: "Замд" },
  { id: "DELIVERED", label: "Хүргэсэн" },
  { id: "RETURNED",  label: "Буцаасан" },
  { id: "CLOSED",    label: "Хаагдсан" },
  { id: "DISPUTE",   label: "Маргаантай" },
];

const TAB_IDS: DriverTabId[] = DRIVER_TABS.map((t) => t.id);

// =================== 2. Туслах функцууд ===================

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
        text: "Танд оноосон",
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
    case "RETURNED":
      return {
        text: "Буцаасан",
        className: "bg-amber-50 text-amber-800 border-amber-100",
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
    case "DISPUTE":
      return {
        text: "Маргаан",
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
  if (!iso) return "";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("mn-MN", { month: "2-digit", day: "2-digit" }) +
    " " +
    d.toLocaleTimeString("mn-MN", { hour: "2-digit", minute: "2-digit" })
  );
}

// Табыгаар filter хийх
function filterByTab(tab: DriverTabId, items: DeliveryRow[]): DeliveryRow[] {
  return items.filter((d) => {
    switch (tab) {
      case "OPEN":
        return d.status === "OPEN";
      case "ASSIGNED":
        return d.status === "ASSIGNED";
      case "PICKED_UP":
        return d.status === "PICKED_UP";
      case "DELIVERED":
        return d.status === "DELIVERED";
      case "RETURNED":
        return d.status === "RETURNED";
      case "CLOSED":
        return d.status === "CLOSED";
      case "DISPUTE":
        return d.status === "DISPUTE";
      default:
        return true;
    }
  });
}

// =================== 3. Гол компонент ===================

export default function DriverDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [user, setUser] = useState<IncomeUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [activeTab, setActiveTab] = useState<DriverTabId>("OPEN");

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // =================== 4. Login guard ===================

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("incomeUser");
      if (!raw) {
        router.replace("/");
        return;
      }
      const parsed: IncomeUser = JSON.parse(raw);
      if (parsed.role !== "driver") {
        router.replace("/");
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

  // =================== 5. Табын эхний утга (URL / localStorage) ===================

  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlTab = searchParams.get("tab");
    if (urlTab && TAB_IDS.includes(urlTab as DriverTabId)) {
      setActiveTab(urlTab as DriverTabId);
      window.localStorage.setItem("driverActiveTab", urlTab);
      return;
    }

    const stored = window.localStorage.getItem("driverActiveTab");
    if (stored && TAB_IDS.includes(stored as DriverTabId)) {
      setActiveTab(stored as DriverTabId);
    }
  }, [searchParams]);

  function changeTab(tab: DriverTabId) {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("driverActiveTab", tab);
    }
    router.push(`/driver?tab=${tab}`);
  }

  // =================== 6. Хүргэлтийн жагсаалт татах ===================

  useEffect(() => {
    if (!user) return;
    void fetchDeliveries(user.id);
  }, [user]);

  async function fetchDeliveries(driverId: string) {
    try {
      setLoadingList(true);
      setError(null);
      setMessage(null);

      // 6.1 Нээлттэй бүх хүргэлт
      const { data: openData, error: openError } = await supabase
        .from("deliveries")
        .select(
          `
          id,
          from_address,
          to_address,
          note,
          status,
          created_at,
          price_mnt,
          delivery_type,
          seller_marked_paid,
          driver_confirmed_payment,
          chosen_driver_id
        `
        )
        .eq("status", "OPEN")
        .order("created_at", { ascending: false });

      if (openError) {
        console.error(openError);
      }

      // 6.2 Энэ жолоочид оноогдсон / өмнө нь хийж байсан бүх хүргэлт
      const { data: mineData, error: mineError } = await supabase
        .from("deliveries")
        .select(
          `
          id,
          from_address,
          to_address,
          note,
          status,
          created_at,
          price_mnt,
          delivery_type,
          seller_marked_paid,
          driver_confirmed_payment,
          chosen_driver_id
        `
        )
        .eq("chosen_driver_id", driverId)
        .order("created_at", { ascending: false });

      if (mineError) {
        console.error(mineError);
      }

      const openRows = (openData || []) as any[];
      const mineRows = (mineData || []) as any[];

      // 6.3 Дубликатгүй нэгтгэх
      const mergedMap = new Map<string, any>();
      for (const d of [...openRows, ...mineRows]) {
        if (!mergedMap.has(d.id)) {
          mergedMap.set(d.id, d);
        }
      }

      const merged = Array.from(mergedMap.values());

      // 6.4 Энэ жолоочийн илгээсэн бүх хүсэлтүүдийг татах
      const { data: bidData, error: bidError } = await supabase
        .from("driver_bids")
        .select("delivery_id")
        .eq("driver_id", driverId);

      if (bidError) {
        console.error(bidError);
      }

      const bidSet = new Set<string>(
        (bidData || []).map((b: any) => b.delivery_id as string)
      );

      // 6.5 Төрөл рүү map хийгээд hasBid нэмэх
      const rows: DeliveryRow[] = merged.map((d: any) => ({
        id: d.id,
        from_address: d.from_address,
        to_address: d.to_address,
        note: d.note,
        status: d.status,
        created_at: d.created_at,
        price_mnt: d.price_mnt,
        delivery_type: d.delivery_type,
        seller_marked_paid: !!d.seller_marked_paid,
        driver_confirmed_payment: !!d.driver_confirmed_payment,
        chosen_driver_id: d.chosen_driver_id,
        hasBid: bidSet.has(d.id),
      }));

      setDeliveries(rows);
    } catch (e) {
      console.error(e);
      setError("Хүргэлтийн жагсаалт татахад алдаа гарлаа.");
      setDeliveries([]);
    } finally {
      setLoadingList(false);
    }
  }

  // =================== 7. Гарах ===================

  function handleLogout() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("incomeUser");
    }
    router.push("/");
  }

  // =================== 8. Жагсаалтын UI ===================

  function renderList(items: DeliveryRow[]) {
    if (items.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
          Энэ таб дээр одоогоор хүргэлт алга байна.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {items.map((d) => {
          const t = typeLabel(d.delivery_type);
          const sb = statusBadge(d.status);

          let subtitle = "";
          if (d.status === "OPEN") {
            subtitle = d.hasBid
              ? "Та энэ хүргэлт дээр авах хүсэлт илгээсэн."
              : "Энэ хүргэлтэд та хараахан авах хүсэлт илгээгээгүй.";
          } else if (d.status === "ASSIGNED") {
            subtitle = "Энэ хүргэлт танд оноосон байна.";
          } else if (d.status === "PICKED_UP") {
            subtitle = "Та барааг аваад хүргэлтэд гарсан.";
          } else if (d.status === "DELIVERED") {
            subtitle = "Энэ хүргэлт хүргэсэн төлөвт байна.";
          } else if (d.status === "RETURNED") {
            subtitle = "Энэ барааг буцаасан.";
          } else if (d.status === "CLOSED") {
            subtitle = "Төлбөрийн тооцоо бүрэн дууссан.";
          } else if (d.status === "DISPUTE") {
            subtitle = "Энэ хүргэлт маргаантай байна.";
          }

          return (
            <button
              key={d.id}
              type="button"
              onClick={() =>
                router.push(`/driver/delivery/${d.id}?tab=${activeTab}`)
              }
              className="w-full text-left rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-emerald-300 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-1">
                  {/* Дээд мөр – ID + статус */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-900">
                      #{d.id.slice(0, 6)}
                    </span>
                    <span
                      className={
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium " +
                        sb.className
                      }
                    >
                      {sb.text}
                    </span>
                    {d.status === "OPEN" && d.hasBid && (
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        Хүсэлт илгээсэн
                      </span>
                    )}
                  </div>

                  {/* Төрөл, үнэ */}
                  <div className="flex items-center gap-2 text-[11px] text-slate-600">
                    <span>{t.icon}</span>
                    <span className="font-medium">{t.label}</span>
                    <span className="text-slate-400">•</span>
                    <span>{formatPrice(d.price_mnt)}</span>
                  </div>

                  {/* Хаягууд */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 mt-1">
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

                  {/* Товч тайлбар + үүсгэсэн огноо */}
                  {d.note && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {shorten(d.note, 80)}
                    </p>
                  )}

                  <p className="mt-1 text-[10px] text-slate-400">
                    Үүсгэсэн: {formatDateTime(d.created_at)}
                  </p>

                  {subtitle && (
                    <p className="mt-1 text-[10px] text-slate-500">{subtitle}</p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  // =================== 9. Ачаалалт / алдаа ===================

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

  const filtered = filterByTab(activeTab, deliveries);

  const tabCounts: Record<DriverTabId, number> = DRIVER_TABS.reduce(
    (acc, t) => {
      acc[t.id] = filterByTab(t.id, deliveries).length;
      return acc;
    },
    {} as Record<DriverTabId, number>
  );

  // =================== 10. Гол UI ===================

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Толгой */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-semibold text-slate-900">
              Жолоочийн самбар
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleLogout}
              className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              Гарах
            </button>
          </div>
        </div>
      </header>

      {/* Агуулга */}
      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {message && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-xs text-emerald-800">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="rounded-2xl border border-slate-200 bg-white px-2 py-2 flex flex-wrap gap-1">
          {DRIVER_TABS.map((tab) => {
            const active = tab.id === activeTab;
            const count = tabCounts[tab.id] || 0;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => changeTab(tab.id)}
                className={
                  "flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-full border transition " +
                  (active
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")
                }
              >
                <span>{tab.label}</span>
                {count > 0 && (
                  <span
                    className={
                      "inline-flex min-w-[18px] justify-center rounded-full px-1.5 py-0.5 text-[10px] " +
                      (active
                        ? "bg-white/10 text-emerald-50"
                        : "bg-slate-100 text-slate-700")
                    }
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Жагсаалт */}
        <section className="space-y-3">{renderList(filtered)}</section>
      </main>
    </div>
  );
}
