"use client";

// =================== 1. Импорт, төрлүүд ===================

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
  note: string | null;
  status: DeliveryStatus;
  created_at: string;
  price_mnt: number | null;
  delivery_type: string | null;
};

type SellerTab =
  | "OPEN"
  | "ASSIGNED"
  | "PICKED_UP"
  | "DELIVERED"
  | "DISPUTE_RETURNED";

// =================== 2. Туслах функцууд ===================

// 2.1. Хүргэлтийн төрлийн icon + текст
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

// 2.2. Статусын badge (өнгө + текст)
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
        text: "Замд гарсан",
        className: "bg-indigo-50 text-indigo-700 border-indigo-100",
      };
    case "DELIVERED":
      return {
        text: "Хүргэсэн",
        className: "bg-slate-900 text-white border-slate-900",
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
    case "RETURNED":
      return {
        text: "Буцаасан",
        className: "bg-amber-50 text-amber-800 border-amber-100",
      };
    default:
      return {
        text: status,
        className: "bg-slate-50 text-slate-600 border-slate-100",
      };
  }
}

// 2.3. Хаягийг богиносгох
function shorten(addr: string | null, max = 60) {
  if (!addr) return "Хаяг тодорхойгүй";
  const s = addr.trim();
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+$/, "") + "…";
}

// 2.4. Үнэ форматлах
function formatPrice(n: number | null) {
  if (!n) return "Үнэ тохиролцоно";
  return n.toLocaleString("mn-MN") + "₮";
}

// 2.5. Огноо/цаг форматлах
function formatDateTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("mn-MN", { month: "2-digit", day: "2-digit" }) +
    " " +
    d.toLocaleTimeString("mn-MN", { hour: "2-digit", minute: "2-digit" })
  );
}

// =================== 3. Гол компонент ===================

export default function SellerDashboardPage() {
  const router = useRouter();

  // 3.1. Төлөвүүд
  const [user, setUser] = useState<IncomeUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(true);

  const [bidCounts, setBidCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<SellerTab>("OPEN");

  const [error, setError] = useState<string | null>(null);

  // 3.2. Login guard (зөвхөн seller)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("incomeUser");
      if (!raw) {
        router.replace("/");
        return;
      }

      const parsed: IncomeUser = JSON.parse(raw);

      if (parsed.role !== "seller") {
        router.replace("/driver");
        return;
      }

      setUser(parsed);
      setLoadingUser(false);
      void fetchDeliveries(parsed.id);
    } catch (e) {
      console.error(e);
      setError("Хэрэглэгчийн мэдээлэл уншихад алдаа гарлаа.");
      setLoadingUser(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3.3. Хүргэлтүүд + жолоочийн саналын тоо татах
  async function fetchDeliveries(sellerId: string) {
    try {
      setLoadingDeliveries(true);
      setError(null);

      const { data, error } = await supabase
        .from("deliveries")
        .select(
          "id, seller_id, from_address, to_address, note, status, created_at, price_mnt, delivery_type"
        )
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        setError("Хүргэлтүүдийг татахад алдаа гарлаа.");
        setDeliveries([]);
        setBidCounts({});
        return;
      }

      const list = (data || []) as Delivery[];
      setDeliveries(list);

      // Жолоочийн саналын тоо
      if (list.length > 0) {
        const ids = list.map((d) => d.id);

        const { data: bids, error: bidsError } = await supabase
          .from("driver_bids")
          .select("delivery_id")
          .in("delivery_id", ids);

        if (bidsError) {
          console.error(bidsError);
          setBidCounts({});
        } else {
          const counts: Record<string, number> = {};
          (bids || []).forEach((row: { delivery_id: string }) => {
            counts[row.delivery_id] = (counts[row.delivery_id] || 0) + 1;
          });
          setBidCounts(counts);
        }
      } else {
        setBidCounts({});
      }
    } finally {
      setLoadingDeliveries(false);
    }
  }

  // 3.4. Гарах, шинэ хүргэлт үүсгэх
  function handleLogout() {
    window.localStorage.removeItem("incomeUser");
    router.push("/");
  }

  function handleNewDelivery() {
    router.push("/seller/new-delivery");
  }

  // 3.5. Ачаалж байх үе
  if (loadingUser) {
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

  // =================== 4. Табын логик ===================

  // 4.1. Статус бүрийн тоо
  const counts = deliveries.reduce<Record<DeliveryStatus, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1;
    return acc;
  }, {} as any);

  const openCount = counts.OPEN || 0;
  const assignedCount = counts.ASSIGNED || 0;
  const pickedUpCount = counts.PICKED_UP || 0;
  const deliveredCount = counts.DELIVERED || 0;
  const disputeReturnedCount = (counts.DISPUTE || 0) + (counts.RETURNED || 0);

  // 4.2. Идэвхтэй табын хүргэлтүүд
  const visibleDeliveries: Delivery[] =
    activeTab === "DISPUTE_RETURNED"
      ? deliveries.filter(
          (d) => d.status === "DISPUTE" || d.status === "RETURNED"
        )
      : deliveries.filter((d) => d.status === activeTab);

  // =================== 5. UI – Худалдагчийн самбар ===================

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 5.1. Дээд толгой хэсэг */}
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
                Худалдагчийн самбар
              </h1>
              <p className="text-xs text-slate-500">
                Хүргэлтүүдээ үүсгэж, жолоочдын саналуудаас сонголт хийнэ.
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

      {/* 5.2. Агуулга */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* 5.2.1. Түргэн үйлдлүүд */}
        <section className="flex flex-wrap gap-3 items-center justify-between">
          <button
            onClick={handleNewDelivery}
            className="inline-flex items-center justify-center rounded-full bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700 transition"
          >
            + Хүргэлт үүсгэх
          </button>

          <button
            onClick={() => fetchDeliveries(user.id)}
            className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Жагсаалтыг шинэчлэх
          </button>
        </section>

        {/* 5.2.2. Табууд */}
        <section className="flex flex-wrap gap-2 text-xs">
          <button
            onClick={() => setActiveTab("OPEN")}
            className={`px-3 py-1.5 rounded-full border ${
              activeTab === "OPEN"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Нээлттэй ({openCount})
          </button>

          <button
            onClick={() => setActiveTab("ASSIGNED")}
            className={`px-3 py-1.5 rounded-full border ${
              activeTab === "ASSIGNED"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Сонгогдсон ({assignedCount})
          </button>

          <button
            onClick={() => setActiveTab("PICKED_UP")}
            className={`px-3 py-1.5 rounded-full border ${
              activeTab === "PICKED_UP"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Замд гарсан ({pickedUpCount})
          </button>

          <button
            onClick={() => setActiveTab("DELIVERED")}
            className={`px-3 py-1.5 rounded-full border ${
              activeTab === "DELIVERED"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Хүргэсэн ({deliveredCount})
          </button>

          <button
            onClick={() => setActiveTab("DISPUTE_RETURNED")}
            className={`px-3 py-1.5 rounded-full border ${
              activeTab === "DISPUTE_RETURNED"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Маргаан / Буцаасан ({disputeReturnedCount})
          </button>
        </section>

        {/* 5.2.3. Алдаа / ачаалалт */}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {loadingDeliveries ? (
          <div className="text-xs text-slate-500">
            Хүргэлтүүдийг ачаалж байна…
          </div>
        ) : visibleDeliveries.length === 0 ? (
          <div className="text-xs text-slate-500">
            Энэ таб дээр харуулах хүргэлт алга.
          </div>
        ) : (
          <section className="space-y-3">
            {visibleDeliveries.map((d) => {
              const t = typeLabel(d.delivery_type);
              const sb = statusBadge(d.status);
              const bids = bidCounts[d.id] || 0;

              return (
                <div
                  key={d.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-slate-600">
                        <span>{t.icon}</span>
                        <span>{t.label}</span>
                      </span>

                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${sb.className}`}
                      >
                        {sb.text}
                      </span>

                      <span className="text-slate-400">
                        {formatDateTime(d.created_at)}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 space-y-0.5">
                      <p>
                        <span className="font-medium text-slate-700">
                          Авах:
                        </span>{" "}
                        {shorten(d.from_address)}
                      </p>
                      <p>
                        <span className="font-medium text-slate-700">
                          Хүргэх:
                        </span>{" "}
                        {shorten(d.to_address)}
                      </p>
                      {d.note && (
                        <p>
                          <span className="font-medium text-slate-700">
                            Юу:
                          </span>{" "}
                          {d.note}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Баруун тал – үнэ + жолоочийн мэдээлэл / саналын тоо */}
                  <div className="flex flex-col items-end gap-1 text-right">
                    <div className="text-sm font-semibold text-slate-900">
                      {formatPrice(d.price_mnt)}
                    </div>

                    <div className="text-[11px] text-slate-500">
                      {d.status === "OPEN" ? (
                        <>
                          Жолоочийн санал:{" "}
                          <span className="font-medium text-slate-700">
                            {bids}
                          </span>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/seller/delivery/${d.id}`)
                          }
                          className="text-emerald-700 hover:text-emerald-800 underline-offset-2 hover:underline"
                        >
                          Жолоочийн мэдээлэл
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => router.push(`/seller/delivery/${d.id}`)}
                      className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      Дэлгэрэнгүй
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
