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
  | "CLOSED" // шинэ - бүрэн хаагдсан
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

  // --- Төлбөрийн талбарууд (DB-с шинэ) ---
  seller_marked_paid: boolean;
  driver_confirmed_payment: boolean;
  closed_at: string | null;
};

type SellerTab =
  | "OPEN"
  | "ASSIGNED"
  | "PICKED_UP"
  | "DELIVERED"
  | "DISPUTE_RETURNED"
  | "PAID"
  | "CLOSED";

// =================== 2. Туслах функцууд ===================

// 2.1. Хүргэлтийн төрлийн icon + текст
function typeLabel(deliveryType: string | null): { icon: string; label: string } {
  switch (deliveryType) {
    case "apartment":
      return { icon: "", label: "Байр" };
    case "ger":
      return { icon: "", label: "Гэр хороолол" };
    case "camp":
      return { icon: "", label: "Лагер" };
    case "countryside":
      return { icon: "", label: "Орон нутаг" };
    default:
      return { icon: "", label: "Хүргэлт" };
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
    case "CLOSED":
      return {
        text: "Хаагдсан",
        className: "bg-slate-100 text-slate-700 border-slate-200",
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
    d.toLocaleDateString("mn-MN", {
      month: "2-digit",
      day: "2-digit",
    }) +
    " " +
    d.toLocaleTimeString("mn-MN", {
      hour: "2-digit",
      minute: "2-digit",
    })
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

  // 3.5. Seller “Жолоочид мөнгөө шилжүүлсэн” товч
  async function handleSellerMarkPaid(d: Delivery) {
    const newSellerMarked = !d.seller_marked_paid;

    const willBeClosed =
      newSellerMarked &&
      d.driver_confirmed_payment &&
      d.status !== "CLOSED" &&
      d.status !== "CANCELLED";

    const { error } = await supabase
      .from("deliveries")
      .update({
        seller_marked_paid: newSellerMarked,
        status: willBeClosed ? "CLOSED" : d.status,
        closed_at: willBeClosed
          ? new Date().toISOString()
          : d.closed_at,
      })
      .eq("id", d.id);

    if (error) {
      console.error(error);
      // Хэрэглэгчид error UI гаргах бол энд setError хийж болно
      return;
    }

    // Local state шинэчлэх
    setDeliveries((prev) =>
      prev.map((row) =>
        row.id === d.id
          ? {
              ...row,
              seller_marked_paid: newSellerMarked,
              status: willBeClosed ? "CLOSED" : row.status,
              closed_at: willBeClosed
                ? new Date().toISOString()
                : row.closed_at,
            }
          : row
      )
    );
  }

  // 3.6. Ачаалж байх үе
  if (loadingUser) {
    return <div>Ачаалж байна…</div>;
  }

  if (!user) {
    return <div>Нэвтрээгүй байна.</div>;
  }

  // =================== 4. Табын логик ===================
  // 4.1. Статус бүрийн тоо
  const counts = deliveries.reduce(
    (acc, d) => {
      acc[d.status] = (acc[d.status] || 0) + 1;
      return acc;
    },
    {} as Record<DeliveryStatus, number>
  );

  const openCount = counts.OPEN || 0;
  const assignedCount = counts.ASSIGNED || 0;
  const pickedUpCount = counts.PICKED_UP || 0;
  const deliveredCount = counts.DELIVERED || 0;
  const disputeReturnedCount = (counts.DISPUTE || 0) + (counts.RETURNED || 0);
  const closedCount = counts.CLOSED || 0;

  const paidCount = deliveries.filter(
    (d) => d.seller_marked_paid || d.driver_confirmed_payment
  ).length;

  // 4.2. Идэвхтэй табын хүргэлтүүд
  let visibleDeliveries: Delivery[] = [];

  if (activeTab === "DISPUTE_RETURNED") {
    visibleDeliveries = deliveries.filter(
      (d) => d.status === "DISPUTE" || d.status === "RETURNED"
    );
  } else if (activeTab === "PAID") {
    visibleDeliveries = deliveries.filter(
      (d) => d.seller_marked_paid || d.driver_confirmed_payment
    );
  } else if (activeTab === "CLOSED") {
    visibleDeliveries = deliveries.filter((d) => d.status === "CLOSED");
  } else {
    visibleDeliveries = deliveries.filter((d) => d.status === activeTab);
  }

  // =================== 5. UI – Худалдагчийн самбар ===================
  return (
    <div className="min-h-screen bg-slate-50">
      {/* 5.1. Дээд толгой хэсэг */}
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <div>
            <div className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1">
              <span className="text-xs font-semibold text-emerald-700">
                INCOME • Худалдагч
              </span>
            </div>
            <h1 className="mt-2 text-xl font-semibold text-slate-900">
              Худалдагчийн самбар
            </h1>
            <p className="text-xs text-slate-500">
              Хүргэлтүүдээ үүсгэж, жолоочдын саналуудаас сонголт хийнэ.
            </p>
          </div>

          <div className="text-right text-xs text-slate-500">
            <div className="font-semibold text-slate-700">{user.name}</div>
            <div>{user.phone}</div>
            <button
              onClick={handleLogout}
              className="mt-1 text-[11px] text-rose-600 hover:text-rose-700"
            >
              Гарах
            </button>
          </div>
        </div>
      </header>

      {/* 5.2. Агуулга */}
      <main className="mx-auto max-w-5xl px-4 py-4 space-y-4">
        {/* 5.2.1. Түргэн үйлдлүүд */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleNewDelivery}
            className="text-xs px-3 py-1.5 rounded-full bg-slate-900 text-white hover:bg-slate-800"
          >
            + Хүргэлт үүсгэх
          </button>
          <button
            onClick={() => fetchDeliveries(user.id)}
            className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Жагсаалтыг шинэчлэх
          </button>
        </div>

        {/* 5.2.2. Табууд */}
        <div className="flex flex-wrap gap-2 text-xs">
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
            Сонгосон ({assignedCount})
          </button>
          <button
            onClick={() => setActiveTab("PICKED_UP")}
            className={`px-3 py-1.5 rounded-full border ${
              activeTab === "PICKED_UP"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Замд ({pickedUpCount})
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
            Маргаан / Буцаалт ({disputeReturnedCount})
          </button>
          <button
            onClick={() => setActiveTab("PAID")}
            className={`px-3 py-1.5 rounded-full border ${
              activeTab === "PAID"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Төлбөр төлсөн ({paidCount})
          </button>
          <button
            onClick={() => setActiveTab("CLOSED")}
            className={`px-3 py-1.5 rounded-full border ${
              activeTab === "CLOSED"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            Хаагдсан ({closedCount})
          </button>
        </div>

        {/* 5.2.3. Алдаа / ачаалалт */}
        {error && (
          <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {loadingDeliveries ? (
          <div className="text-sm text-slate-500">Хүргэлтүүдийг ачаалж байна…</div>
        ) : visibleDeliveries.length === 0 ? (
          <div className="text-sm text-slate-500">
            Энэ таб дээр харуулах хүргэлт алга.
          </div>
        ) : (
          <div className="space-y-3">
            {visibleDeliveries.map((d) => {
              const t = typeLabel(d.delivery_type);
              const sb = statusBadge(d.status);
              const bids = bidCounts[d.id] || 0;

              const sellerPaid = d.seller_marked_paid;
              const driverPaid = d.driver_confirmed_payment;
              const bothPaid = sellerPaid && driverPaid;

              return (
                <div
                  key={d.id}
                  className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 flex flex-col gap-2"
                >
                  {/* Зүүн тал – төрөл, статус, огноо */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 text-xs text-slate-600">
                      <div className="inline-flex items-center gap-2">
                        <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 text-slate-700">
                          {t.icon} {t.label}
                        </span>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full border ${sb.className}`}
                        >
                          {sb.text}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {formatDateTime(d.created_at)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        ID: {d.id.slice(0, 8).toUpperCase()}
                      </div>
                    </div>

                    {/* Баруун тал – үнэ + саналын тоо / жолооч инфо */}
                    <div className="text-right text-xs text-slate-600 space-y-1">
                      <div className="font-semibold text-slate-900 text-sm">
                        {formatPrice(d.price_mnt)}
                      </div>
                      {d.status === "OPEN" ? (
                        <div className="text-[11px] text-slate-500">
                          Жолоочийн санал:{" "}
                          <span className="font-semibold text-slate-800">
                            {bids}
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            router.push(`/seller/delivery/${d.id}`)
                          }
                          className="text-[11px] text-emerald-700 hover:text-emerald-800 underline-offset-2 hover:underline"
                        >
                          Жолоочийн мэдээлэл
                        </button>
                      )}

                      <button
                        onClick={() =>
                          router.push(`/seller/delivery/${d.id}`)
                        }
                        className="block ml-auto text-[11px] px-3 py-1.5 rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        Дэлгэрэнгүй
                      </button>
                    </div>
                  </div>

                  {/* Хаяг, тэмдэглэл */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      <div className="font-semibold text-[11px] text-slate-500">
                        АВАХ ХАЯГ
                      </div>
                      <div>{shorten(d.from_address)}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-[11px] text-slate-500">
                        ХҮРГЭХ ХАЯГ
                      </div>
                      <div>{shorten(d.to_address)}</div>
                    </div>
                  </div>

                  {d.note && (
                    <div className="text-xs text-slate-600">
                      <span className="font-semibold text-[11px] text-slate-500">
                        ЮУ:
                      </span>{" "}
                      {d.note}
                    </div>
                  )}

                  {/* Төлбөрийн мөр */}
                  <div className="mt-2 pt-2 border-t border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="text-[11px] text-slate-500 space-y-0.5">
                      <div>
                        Худалдагч:{" "}
                        <span
                          className={
                            sellerPaid
                              ? "text-emerald-600 font-semibold"
                              : "text-slate-700"
                          }
                        >
                          {sellerPaid
                            ? "Жолоочид мөнгөө шилжүүлсэн"
                            : "Мөнгөө шилжүүлээгүй"}
                        </span>
                      </div>
                      <div>
                        Жолооч:{" "}
                        <span
                          className={
                            driverPaid
                              ? "text-emerald-600 font-semibold"
                              : "text-slate-700"
                          }
                        >
                          {driverPaid
                            ? "Төлбөрөө бүрэн авсан"
                            : "Баталгаажаагүй"}
                        </span>
                      </div>
                      {bothPaid && d.closed_at && (
                        <div className="text-[11px] text-slate-400">
                          Хаагдсан: {formatDateTime(d.closed_at)}
                        </div>
                      )}
                    </div>

                    {/* Seller товч */}
                    {d.status !== "CANCELLED" && (
                      <button
                        onClick={() => handleSellerMarkPaid(d)}
                        className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-[11px] font-medium border
                          ${
                            sellerPaid
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                      >
                        {sellerPaid
                          ? "Жолоочид шилжүүлээгүй гэж засах"
                          : "Жолоочид мөнгөө шилжүүлсэн"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
