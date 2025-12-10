"use client";

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
  | "DISPUTE"
  | "CANCELLED"
  | "CLOSED";

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
};

type SellerTabId =
  | "OPEN"
  | "ASSIGNED"
  | "PICKED_UP"
  | "DELIVERED"
  | "RETURNED"
  | "PAID"
  | "CLOSED"
  | "DISPUTE";

const SELLER_TABS: { id: SellerTabId; label: string }[] = [
  { id: "OPEN",      label: "Нээлттэй" },
  { id: "ASSIGNED",  label: "Сонгосон" },
  { id: "PICKED_UP", label: "Замд" },
  { id: "DELIVERED", label: "Хүргэсэн" },
  { id: "PAID",      label: "Төлбөр төлсөн" },
  { id: "CLOSED",    label: "Хаагдсан" },
  { id: "RETURNED",  label: "Буцаалт" },
  { id: "DISPUTE",   label: "Маргаан" }, // ✔ хамгийн сүүлд
];

const TAB_IDS: SellerTabId[] = SELLER_TABS.map((t) => t.id);

// -------- туслах функцууд --------

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
        text: "Буцаалт",
        className: "bg-amber-50 text-amber-800 border-amber-100",
      };
    case "DISPUTE":
      return {
        text: "Маргаан",
        className: "bg-rose-50 text-rose-700 border-rose-100",
      };
    case "CANCELLED":
      return {
        text: "Цуцалсан",
        className: "bg-rose-50 text-rose-700 border-rose-100",
      };
    case "CLOSED":
      return {
        text: "Хаагдсан",
        className: "bg-emerald-900 text-emerald-50 border-emerald-900",
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

// -------- табын дагуу filter --------

function filterByTab(tab: SellerTabId, items: DeliveryRow[]): DeliveryRow[] {
  return items.filter((d) => {
    switch (tab) {
      case "OPEN":
        return d.status === "OPEN";
      case "ASSIGNED":
        return d.status === "ASSIGNED";
      case "PICKED_UP":
        return d.status === "PICKED_UP"; // DISPUTE-г эндээс салгасан
      case "DELIVERED":
        // хүргэсэн боловч төлбөр тэмдэглээгүй
        return d.status === "DELIVERED" && !d.seller_marked_paid;
      case "RETURNED":
        return d.status === "RETURNED";
      case "PAID":
        // худалдагч төлсөн, жолооч хараахан батлаагүй (DELIVERED төлөв)
        return (
          d.status === "DELIVERED" &&
          !!d.seller_marked_paid &&
          !d.driver_confirmed_payment
        );
      case "CLOSED":
        return d.status === "CLOSED";
      case "DISPUTE":
        return d.status === "DISPUTE";
      default:
        return true;
    }
  });
}

// ================== ГОЛ КОМПОНЕНТ ==================

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

  // ---- Login guard ----
  useEffect(() => {
    try {
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
    } catch (e) {
      console.error(e);
      setError("Хэрэглэгчийн мэдээлэл уншихад алдаа гарлаа.");
      setLoadingUser(false);
    }
  }, [router]);

  // ---- Табын эхний утга (URL эсвэл localStorage-оос) ----
  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlTab = searchParams.get("tab");
    if (urlTab && TAB_IDS.includes(urlTab as SellerTabId)) {
      setActiveTab(urlTab as SellerTabId);
      window.localStorage.setItem("sellerActiveTab", urlTab);
      return;
    }

    const stored = window.localStorage.getItem("sellerActiveTab");
    if (stored && TAB_IDS.includes(stored as SellerTabId)) {
      setActiveTab(stored as SellerTabId);
    }
  }, [searchParams]);

  function changeTab(tab: SellerTabId) {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sellerActiveTab", tab);
    }
    router.push(`/seller?tab=${tab}`);
  }

  // ---- Хүргэлтийн жагсаалт татах ----
  useEffect(() => {
    if (!user) return;
    void fetchDeliveries(user.id);
  }, [user]);

  async function fetchDeliveries(sellerId: string) {
    try {
      setLoadingList(true);
      setError(null);
      setMessage(null);

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
          closed_at
        `
        )
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        setError("Хүргэлтийн жагсаалт татахад алдаа гарлаа.");
        setDeliveries([]);
        return;
      }

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
      }));

      setDeliveries(rows);
    } finally {
      setLoadingList(false);
    }
  }

  // ---- UI helper ----
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

          let paymentText = "";
          if (d.status === "DELIVERED") {
            if (d.seller_marked_paid && !d.driver_confirmed_payment) {
              paymentText = "Худалдагч төлсөн, жолооч батлаагүй";
            } else if (!d.seller_marked_paid) {
              paymentText = "Төлбөр хүлээгдэж байна";
            }
          } else if (d.status === "CLOSED") {
            paymentText = "Төлбөр бүрэн тооцоо хийсэн";
          }

          return (
            <button
              key={d.id}
              type="button"
              onClick={() =>
                router.push(`/seller/delivery/${d.id}?tab=${activeTab}`)
              }
              className="w-full text-left rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-emerald-300 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-1">
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
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-600">
                    <span>{t.icon}</span>
                    <span className="font-medium">{t.label}</span>
                    <span className="text-slate-400">•</span>
                    <span>{formatPrice(d.price_mnt)}</span>
                  </div>

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

                  {d.note && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {shorten(d.note, 80)}
                    </p>
                  )}

                  <p className="mt-1 text-[10px] text-slate-400">
                    Үүсгэсэн: {formatDateTime(d.created_at)}
                  </p>

                  {paymentText && (
                    <p className="mt-1 text-[10px] text-emerald-700">
                      {paymentText}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  // ---- ачаалалт / алдаа ----
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

  // таб бүрийн тоо
  const tabCounts: Record<SellerTabId, number> = SELLER_TABS.reduce(
    (acc, t) => {
      acc[t.id] = filterByTab(t.id, deliveries).length;
      return acc;
    },
    {} as Record<SellerTabId, number>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Толгой */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-semibold text-slate-900">
              Худалдагчийн самбар
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/")}
              className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Гарах
            </button>
            <button
              onClick={() => router.push("/seller/new-delivery")}
              className="text-[11px] px-5 py-2 rounded-full bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
            >
              + Хүргэлт нэмэх
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
          {SELLER_TABS.map((tab) => {
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
