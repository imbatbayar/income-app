"use client";

// =================== 1. Импорт, төрлүүд ===================

import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  DeliveryStatus,
  canOpenDisputeForDriver as baseCanOpenDisputeForDriver,
} from "@/lib/deliveryLogic";

type Role = "seller" | "driver";

type IncomeUser = {
  id: string;
  role: Role;
  name: string;
  phone: string;
  email: string;
};

type DeliveryDetail = {
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
  closed_at: string | null;

  // seller info
  seller_name?: string | null;
  seller_phone?: string | null;
};

type DriverBidRow = {
  id: string;
  delivery_id: string;
  driver_id: string;
  created_at: string;
};

type DriverOwnBid = DriverBidRow | null;

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
    case "ON_ROUTE":
      return {
        text: "Замд",
        className: "bg-indigo-50 text-indigo-700 border-indigo-100",
      };
    case "DELIVERED":
      return {
        text: "Хүргэсэн",
        className: "bg-slate-900 text-white border-slate-900",
      };
    case "PAID":
      return {
        text: "Төлбөр баталгаажсан",
        className: "bg-emerald-900 text-emerald-50 border-emerald-900",
      };
    case "CLOSED":
      return {
        text: "Хаагдсан",
        className: "bg-slate-800 text-slate-50 border-slate-800",
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

function shorten(s: string | null, max = 120) {
  if (!s) return "";
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+$/, "") + "…";
}

function formatPrice(n: number | null) {
  if (!n) return "Үнэ тохиролцоно";
  return n.toLocaleString("mn-MN") + "₮";
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("mn-MN", { month: "2-digit", day: "2-digit" }) +
    " " +
    d.toLocaleTimeString("mn-MN", { hour: "2-digit", minute: "2-digit" })
  );
}

function mapsUrl(addr: string | null) {
  if (!addr) return "";
  const q = encodeURIComponent(addr);
  return `https://maps.google.com/?q=${q}`;
}

// =================== 3. Гол компонент ===================

export default function DriverDeliveryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const idParam = (params as any)?.id;
  const deliveryId =
    typeof idParam === "string"
      ? idParam
      : Array.isArray(idParam)
      ? idParam[0]
      : "";

  const fromTab = searchParams.get("tab");
  const backUrl = fromTab ? `/driver?tab=${fromTab}` : "/driver";

  // ---- төлөвүүд ----
  const [user, setUser] = useState<IncomeUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);

  const [ownBid, setOwnBid] = useState<DriverOwnBid>(null);
  const [loadingBid, setLoadingBid] = useState(true);

  // action-уудын loading
  const [requesting, setRequesting] = useState(false);
  const [markingOnRoute, setMarkingOnRoute] = useState(false);
  const [markingDelivered, setMarkingDelivered] = useState(false);
  const [confirmPayLoading, setConfirmPayLoading] = useState(false);

  // Маргаан
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [openingDispute, setOpeningDispute] = useState(false);

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

  // =================== 5. Хүргэлт + өөрийн bid татах ===================

  useEffect(() => {
    if (!user || !deliveryId) return;
    void fetchDetailAndBid(user.id, deliveryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, deliveryId]);

  async function fetchDetailAndBid(driverId: string, id: string) {
    try {
      setLoadingDetail(true);
      setLoadingBid(true);
      setError(null);
      setMessage(null);

      // 5.1 Хүргэлтийн дэлгэрэнгүй
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
          chosen_driver_id,
          seller_marked_paid,
          driver_confirmed_payment,
          closed_at,
          seller:seller_id (
            name,
            phone
          )
        `
        )
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error(error);
        setError("Хүргэлтийн мэдээлэл татахад алдаа гарлаа.");
        setDelivery(null);
      } else if (!data) {
        setError("Ийм хүргэлт олдсонгүй.");
        setDelivery(null);
      } else {
        const d = data as any;
        const detail: DeliveryDetail = {
          id: d.id,
          seller_id: d.seller_id,
          from_address: d.from_address,
          to_address: d.to_address,
          note: d.note,
          status: d.status as DeliveryStatus,
          created_at: d.created_at,
          price_mnt: d.price_mnt,
          delivery_type: d.delivery_type,
          chosen_driver_id: d.chosen_driver_id,
          seller_marked_paid: !!d.seller_marked_paid,
          driver_confirmed_payment: !!d.driver_confirmed_payment,
          closed_at: d.closed_at,
          seller_name: d.seller?.name ?? null,
          seller_phone: d.seller?.phone ?? null,
        };
        setDelivery(detail);
      }

      setLoadingDetail(false);

      // 5.2 Энэ хүргэлт дээрх өөрийн bid байгаа эсэх
      const { data: bidData, error: bidError } = await supabase
        .from("driver_bids")
        .select("id, delivery_id, driver_id, created_at")
        .eq("delivery_id", id)
        .eq("driver_id", driverId)
        .maybeSingle();

      if (bidError && bidError.code !== "PGRST116") {
        console.error("BID LOAD ERROR:", bidError);
      }

      if (!bidError && bidData) {
        setOwnBid(bidData as DriverBidRow);
      } else {
        setOwnBid(null);
      }

      setLoadingBid(false);
    } catch (e) {
      console.error(e);
      setError("Мэдээлэл татах явцад алдаа гарлаа.");
      setLoadingDetail(false);
      setLoadingBid(false);
    }
  }

  // =================== 6. Гарах ===================

  function handleLogout() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("incomeUser");
    }
    router.push("/");
  }

  // =================== 7. Авах хүсэлт илгээх (OPEN үед) ===================

  async function handleRequestDelivery() {
    if (!user || !delivery) return;

    if (delivery.status !== "OPEN") {
      setMessage("Зөвхөн нээлттэй хүргэлт дээр авах хүсэлт гаргаж болно.");
      return;
    }

    if (ownBid) {
      setMessage("Та аль хэдийн энэ хүргэлт дээр авах хүсэлт илгээсэн байна.");
      return;
    }

    setRequesting(true);
    setError(null);
    setMessage(null);

    try {
      const { data, error } = await supabase
        .from("driver_bids")
        .insert({
          delivery_id: delivery.id,
          driver_id: user.id,
        })
        .select()
        .single();

      if (error) {
        console.error(error);
        setError("Авах хүсэлт илгээхэд алдаа гарлаа.");
        return;
      }

      setOwnBid(data as DriverBidRow);
      setMessage("Авах хүсэлт амжилттай илгээгдлээ.");
    } finally {
      setRequesting(false);
    }
  }

  // =================== 8. Хүргэлтийн явцын статус өөрчлөх ===================

  async function updateStatus(newStatus: DeliveryStatus) {
    if (!user || !delivery) return;

    setError(null);
    setMessage(null);

    let setter: (v: boolean) => void = () => {};
    if (newStatus === "ON_ROUTE") setter = setMarkingOnRoute;
    if (newStatus === "DELIVERED") setter = setMarkingDelivered;

    setter(true);

    try {
      const { error } = await supabase
        .from("deliveries")
        .update({ status: newStatus })
        .eq("id", delivery.id)
        .eq("chosen_driver_id", user.id);

      if (error) {
        console.error(error);
        setError("Статус өөрчлөхөд алдаа гарлаа.");
        return;
      }

      setDelivery({ ...delivery, status: newStatus });

      if (newStatus === "ON_ROUTE") {
        setMessage("Барааг авч, хүргэлтэд гарлаа гэж тэмдэглэлээ.");
      } else if (newStatus === "DELIVERED") {
        setMessage("Хүргэлтийг амжилттай дууссан гэж тэмдэглэлээ.");
      }
    } finally {
      setter(false);
    }
  }

  async function handleMarkOnRoute() {
    if (!delivery || !user) return;
    if (delivery.status !== "ASSIGNED" || delivery.chosen_driver_id !== user.id) {
      setMessage("Эхлээд энэ хүргэлт танд оноогдсон байх ёстой.");
      return;
    }
    await updateStatus("ON_ROUTE");
  }

  async function handleMarkDelivered() {
    if (!delivery || !user) return;
    if (delivery.status !== "ON_ROUTE" || delivery.chosen_driver_id !== user.id) {
      setMessage("Зөвхөн замд байгаа хүргэлтийг хүргэсэн гэж тэмдэглэнэ.");
      return;
    }
    await updateStatus("DELIVERED");
  }

  // =================== 9. Төлбөр авснаа батлах (driver_confirmed_payment) ===================

  async function handleConfirmPayment() {
    if (!delivery || !user) return;

    if (delivery.chosen_driver_id !== user.id) {
      setError("Зөвхөн өөрт оноосон хүргэлт дээр төлбөр батална.");
      return;
    }

    if (!delivery.seller_marked_paid) {
      setError("Худалдагч төлбөр шилжүүлсэн гэж тэмдэглэсний дараа батална.");
      return;
    }

    setConfirmPayLoading(true);
    setError(null);
    setMessage(null);

    try {
      const newDriverConfirmed = !delivery.driver_confirmed_payment;
      const willBeClosed =
        newDriverConfirmed &&
        delivery.seller_marked_paid &&
        delivery.status === "DELIVERED";

      const { error } = await supabase
        .from("deliveries")
        .update({
          driver_confirmed_payment: newDriverConfirmed,
          status: willBeClosed ? "CLOSED" : delivery.status,
          closed_at: willBeClosed
            ? new Date().toISOString()
            : delivery.closed_at,
        })
        .eq("id", delivery.id)
        .eq("chosen_driver_id", user.id);

      if (error) {
        console.error(error);
        setError("Төлбөр авснаа батлахад алдаа гарлаа.");
        return;
      }

      setDelivery({
        ...delivery,
        driver_confirmed_payment: newDriverConfirmed,
        status: willBeClosed ? "CLOSED" : delivery.status,
        closed_at: willBeClosed
          ? new Date().toISOString()
          : delivery.closed_at,
      });

      setMessage(
        newDriverConfirmed
          ? "Төлбөрөө бүрэн авсан гэж тэмдэглэлээ."
          : "Төлбөрөө баталгаажаагүй гэж заслаа."
      );
    } finally {
      setConfirmPayLoading(false);
    }
  }

  // =================== 10. Маргаан нээх (driver тал) ===================

  const isThisDriverAssigned =
    !!delivery &&
    !!user &&
    delivery.chosen_driver_id === user.id;

  const canOpenDispute =
    !!delivery &&
    isThisDriverAssigned &&
    baseCanOpenDisputeForDriver(delivery.status);

  async function handleOpenDisputeConfirm() {
    if (!delivery || !user) return;
    if (!isThisDriverAssigned) {
      setError("Зөвхөн өөрт оноосон хүргэлт дээр маргаан нээнэ.");
      return;
    }

    const reason = disputeReason.trim();
    if (!reason) {
      setError("Маргааны шалтгаанаа товчхон бичнэ үү.");
      return;
    }

    setOpeningDispute(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("deliveries")
        .update({
          status: "DISPUTE",
          dispute_reason: reason,
          dispute_opened_at: new Date().toISOString(),
        })
        .eq("id", delivery.id)
        .eq("chosen_driver_id", user.id);

      if (error) {
        console.error(error);
        setError("Маргаан нээхэд алдаа гарлаа.");
        return;
      }

      setDelivery({
        ...delivery,
        status: "DISPUTE",
      });

      setShowDisputeModal(false);
      setDisputeReason("");
      setMessage("Маргаан амжилттай нээгдлээ.");
    } finally {
      setOpeningDispute(false);
    }
  }

  // =================== 11. Ачаалалт / алдаа ===================

  if (loadingUser || loadingDetail || loadingBid) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Ачаалж байна…</div>
      </div>
    );
  }

  if (!user || !delivery) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">
          Хүргэлтийн мэдээлэл олдсонгүй.
        </div>
      </div>
    );
  }

  const t = typeLabel(delivery.delivery_type);
  const sb = statusBadge(delivery.status);

  const sellerPaid = !!delivery.seller_marked_paid;
  const driverConfirmed = !!delivery.driver_confirmed_payment;

  const hasOwnBid = !!ownBid;
  const isOpen = delivery.status === "OPEN";
  const isAssigned = delivery.status === "ASSIGNED" && isThisDriverAssigned;
  const isOnRoute = delivery.status === "ON_ROUTE" && isThisDriverAssigned;
  const isDelivered = delivery.status === "DELIVERED" && isThisDriverAssigned;

  // =================== 12. Гол UI ===================

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Толгой */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Mobile back товч */}
            <button
              onClick={() => router.push(backUrl)}
              className="inline-flex sm:hidden items-center justify-center h-8 w-8 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              ←
            </button>

            <div>
              <div className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5">
                <span className="text-xs text-slate-600">
                  Жолоочийн дэлгэрэнгүй
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">
                  #{delivery.id.slice(0, 6)}
                </span>
                <span
                  className={
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium " +
                    sb.className
                  }
                >
                  {sb.text}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Үүсгэсэн: {formatDateTime(delivery.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Desktop back товч */}
            <button
              onClick={() => router.push(backUrl)}
              className="hidden sm:inline-flex text-[11px] px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              ← Буцах
            </button>
            {/* Гарах */}
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
        {/* Статус баннерууд */}
        {delivery.status === "DISPUTE" && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-800">
            Энэ хүргэлт дээр <span className="font-semibold">маргаан</span>{" "}
            нээгдсэн. Системийн админ асуудлыг шалгаж байгаа.
          </div>
        )}

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

        {/* Карт 1 – Хаяг, юу хүргэх, Maps линк */}
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span>{t.icon}</span>
              <span className="font-medium text-slate-800">{t.label}</span>
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {formatPrice(delivery.price_mnt)}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600">
            <div>
              <div className="text-[11px] font-semibold text-slate-500">
                АВАХ ХАЯГ
              </div>
              <p className="mt-1">{shorten(delivery.from_address)}</p>
              {delivery.from_address && (
                <a
                  href={mapsUrl(delivery.from_address)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex text-[11px] text-sky-600 hover:underline"
                >
                  Google Maps дээр харах
                </a>
              )}
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-500">
                ХҮРГЭХ ХАЯГ
              </div>
              <p className="mt-1">{shorten(delivery.to_address)}</p>
              {delivery.to_address && (
                <a
                  href={mapsUrl(delivery.to_address)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex text-[11px] text-sky-600 hover:underline"
                >
                  Google Maps дээр харах
                </a>
              )}
            </div>
          </div>

          {delivery.note && (
            <div className="pt-2 border-t border-slate-100">
              <div className="text-[11px] font-semibold text-slate-500">
                ЮУ ХҮРГЭХ ВЭ?
              </div>
              <p className="mt-1 text-xs text-slate-700">{delivery.note}</p>
            </div>
          )}
        </section>

        {/* Карт 2 – Худалдагчийн мэдээлэл */}
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Худалдагчийн мэдээлэл
          </h2>
          <div className="space-y-1 text-xs text-slate-700">
            <p>
              <span className="font-semibold">Нэр:</span>{" "}
              {delivery.seller_name || "Бүртгэгдээгүй"}
            </p>
            <p>
              <span className="font-semibold">Утас:</span>{" "}
              {delivery.seller_phone || "утасны дугаар бүртгэгдээгүй"}
            </p>
          </div>
        </section>

        {/* Карт 3 – Жолоочийн үйлдлүүд */}
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Хүргэлтийн явц, шийдвэр (жолооч)
          </h2>

          {/* 3.1 – Нээлттэй үед: Авах хүсэлт */}
          {isOpen && (
            <div className="border-b border-slate-100 pb-3 mb-2 space-y-2">
              <p className="text-xs text-slate-600">
                Энэ хүргэлт нээлттэй байна. Та авах хүсэлт илгээвэл худалдагч
                таныг сонгож болно.
              </p>
              <button
                onClick={handleRequestDelivery}
                disabled={requesting || hasOwnBid}
                className="text-[11px] px-4 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {hasOwnBid
                  ? "Авах хүсэлт илгээсэн"
                  : requesting
                  ? "Илгээж байна…"
                  : "Авах хүсэлт гаргах"}
              </button>
            </div>
          )}

          {/* 3.2 – Танд оноосон / Замд / Хүргэсэн үеийн товчнууд */}
          {(isAssigned || isOnRoute || isDelivered) && (
            <div className="border-b border-slate-100 pb-3 mb-2 space-y-2">
              {isAssigned && (
                <div className="flex flex-wrap items-center justify_between gap-2">
                  <p className="text-xs text-slate-600">
                    Энэ хүргэлт танд оноосон байна. Барааг авсан үед{" "}
                    <span className="font-medium">“Барааг авлаа”</span> гэж
                    тэмдэглэнэ.
                  </p>
                  <button
                    onClick={handleMarkOnRoute}
                    disabled={markingOnRoute}
                    className="text-[11px] px-4 py-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {markingOnRoute ? "Тэмдэглэж байна…" : "Барааг авлаа"}
                  </button>
                </div>
              )}

              {isOnRoute && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600">
                    Та барааг авсан, замд явж байна. Хүргэлт амжилттай дууссан
                    үед{" "}
                    <span className="font-medium">“Хүргэлт хийсэн”</span> гэж
                    тэмдэглэнэ.
                    Хэрвээ асуудал гарвал (хаяг олдохгүй, төлбөр өгөхгүй гэх
                    мэт) дараа нь{" "}
                    <span className="font-medium">маргаан нээх</span> боломжтой.
                  </p>
                  <button
                    onClick={handleMarkDelivered}
                    disabled={markingDelivered}
                    className="text-[11px] px-4 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {markingDelivered ? "Тэмдэглэж байна…" : "Хүргэлт хийсэн"}
                  </button>
                </div>
              )}

              {isDelivered && (
                <p className="text-xs text-slate-600">
                  Та энэ хүргэлтийг{" "}
                  <span className="font-semibold">хүргэсэн</span> гэж
                  тэмдэглэсэн. Худалдагч төлбөрөө шилжүүлсэн гэж тэмдэглэсний
                  дараа “Төлбөрөө авсан” гэж баталж, хүргэлт хаагдана.
                </p>
              )}
            </div>
          )}

          {/* 3.3 – Төлбөрийн хэсэг */}
          {(isDelivered || delivery.status === "CLOSED") && (
            <div className="border-b border-slate-100 pb-3 mb-2 space-y-2">
              <p className="text-xs text-slate-600">
                Худалдагч төлбөр төлснөө тэмдэглэсэн эсэх, та төлбөрөө бүрэн
                авсан эсэхийг доор харуулна.
              </p>
              <div className="space-y-1 text-[11px] text-slate-500">
                <p>
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
                      : "Мөнгөө шилжүүлсэн гэж тэмдэглээгүй"}
                  </span>
                </p>
                <p>
                  Жолооч (та):{" "}
                  <span
                    className={
                      driverConfirmed
                        ? "text-emerald-600 font-semibold"
                        : "text-slate-700"
                    }
                  >
                    {driverConfirmed
                      ? "Төлбөрөө бүрэн авсан"
                      : "Баталгаажаагүй"}
                  </span>
                </p>
                {delivery.closed_at && (
                  <p className="text-[11px] text-slate-400">
                    Хаагдсан: {formatDateTime(delivery.closed_at)}
                  </p>
                )}
              </div>

              {isDelivered && (
                <button
                  onClick={handleConfirmPayment}
                  disabled={confirmPayLoading}
                  className="mt-1 text-[11px] px-4 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {confirmPayLoading
                    ? "Тэмдэглэж байна…"
                    : driverConfirmed
                    ? "Төлбөр авсан гэж засах"
                    : "Төлбөрөө авсан гэж тэмдэглэх"}
                </button>
              )}
            </div>
          )}

          {/* 3.4 – Маргаан үүсгэх */}
          {canOpenDispute && (
            <div className="space-y-2">
              <p className="text-xs text-slate-600">
                Хүргэлтийн явцад{" "}
                <span className="font-semibold text-rose-700">
                  ноцтой зөрчил
                </span>{" "}
                гарсан (худалдагч төлбөр өгөхөөс татгалзсан, тогтсон
                тохиролцоог зөрчсөн гэх мэт) бол маргаан нээж болно. Болсон
                үйлдлийг тодорхой бичнэ үү.
              </p>
              <button
                onClick={() => setShowDisputeModal(true)}
                className="text-[11px] px-4 py-2 rounded-full border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              >
                Маргаан үүсгэх
              </button>
            </div>
          )}

          {delivery.status === "CLOSED" && (
            <div className="border-t border-slate-100 pt-3 mt-2">
              <p className="text-xs text-slate-600">
                Энэ хүргэлт{" "}
                <span className="font-semibold">хаагдсан</span>. Төлбөрийн
                тооцоо бүрэн дууссан.
              </p>
            </div>
          )}
        </section>

        {/* Маргаан modal */}
        {showDisputeModal && (
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4">
            <div className="max-w-md w-full rounded-2xl bg-white shadow-lg border border-slate-200 px-4 py-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Маргаан үүсгэх (жолооч)
              </h3>
              <p className="text-xs text-slate-600">
                Худалдагчтай ноцтой асуудал гарсан (төлбөр өгөхөөс татгалзсан,
                тохирсон нөхцөлийг зөрчсөн гэх мэт) үед л маргаан нээнэ. Болсон
                нөхцөл байдлыг товч, тодорхой бичнэ үү.
              </p>
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                placeholder="Юу болсон талаар товчхон, тодорхой бичнэ үү…"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDisputeModal(false)}
                  disabled={openingDispute}
                  className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Болих
                </button>
                <button
                  type="button"
                  onClick={handleOpenDisputeConfirm}
                  disabled={openingDispute}
                  className="text-[11px] px-3 py-1.5 rounded-full bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {openingDispute ? "Илгээж байна…" : "Маргаан нээх"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
