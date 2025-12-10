"use client";

/* ===========================
 * BLOCK 1 — IMPORT & EXTERNAL LOGIC
 * =========================== */

import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  DeliveryStatus,
  canOpenDisputeForSeller,
} from "@/lib/deliveryLogic";

/* ===========================
 * BLOCK 2 — TYPES
 * - Role, IncomeUser, DeliveryDetail, DriverSummary, DriverBidRow
 * =========================== */

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

  // Төлбөр / маргааны нэмэлт талбарууд
  seller_marked_paid: boolean;
  driver_confirmed_payment: boolean;
  closed_at: string | null;
  dispute_reason?: string | null;
  dispute_opened_at?: string | null;
};

type DriverSummary = {
  id: string;
  name: string | null;
  phone: string | null;
  rating?: number | null;
  total_deliveries?: number | null;
  // Дараа нь энд машины дугаар, регистр гэх мэтийг нэмнэ
};

type DriverBidRow = {
  id: string;
  driver_id: string;
  created_at: string;
  driver: DriverSummary | null;
};

/* ===========================
 * BLOCK 3 — HELPER FUNCTIONS
 * - typeLabel, statusBadge, shorten, formatPrice, formatDateTime, driverRatingText
 * =========================== */

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

function formatDateTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("mn-MN", { month: "2-digit", day: "2-digit" }) +
    " " +
    d.toLocaleTimeString("mn-MN", { hour: "2-digit", minute: "2-digit" })
  );
}

function driverRatingText(driver: DriverSummary | null) {
  if (!driver) return "Үнэлгээ байхгүй";
  if (driver.rating == null) return "Үнэлгээ байхгүй";
  const r = driver.rating.toFixed(1).replace(/\.0$/, "");
  const total = driver.total_deliveries || 0;
  return `${r} ★ • ${total} хүргэлт`;
}

/* ===========================
 * BLOCK 4 — MAIN COMPONENT
 * =========================== */

export default function SellerDeliveryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  /* ---------- SUB-BLOCK 4.1 — PARAMS & BACK URL ---------- */

  const idParam = (params as any)?.id;
  const deliveryId =
    typeof idParam === "string"
      ? idParam
      : Array.isArray(idParam)
      ? idParam[0]
      : "";

  const fromTab = searchParams.get("tab");
  const backUrl = fromTab ? `/seller?tab=${fromTab}` : "/seller";

  /* ---------- SUB-BLOCK 4.2 — STATE ---------- */

  const [user, setUser] = useState<IncomeUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);
  const [bids, setBids] = useState<DriverBidRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(true);

  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [markingPickedUp, setMarkingPickedUp] = useState(false);

  const [ratingStars, setRatingStars] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState("");
  const [closing, setClosing] = useState(false);

  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [openingDispute, setOpeningDispute] = useState(false);
  const [resolvingDispute] = useState(false); // одоохондоо ашиглахгүй ч үлдээе

  // Сонгогдсон жолоочийг цуцлах
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReasons, setCancelReasons] = useState({
    no_show: false,
    too_late: false,
    no_contact: false,
    bad_attitude: false,
  });
  const [cancelOtherReason, setCancelOtherReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Жолоочийн дэлгэрэнгүй modal
  const [showDriverInfoModal, setShowDriverInfoModal] = useState(false);

  // Төлбөр тэмдэглэх
  const [payLoading, setPayLoading] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* ===========================
   * BLOCK 5 — LOGIN GUARD
   * =========================== */

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

  /* ===========================
   * BLOCK 6 — FETCH DELIVERY DETAIL
   * =========================== */

  useEffect(() => {
    if (!user || !deliveryId) return;
    void fetchDetail(user.id, deliveryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, deliveryId]);

  async function fetchDetail(sellerId: string, id: string) {
    try {
      setLoadingDetail(true);
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
          chosen_driver_id,
          seller_marked_paid,
          driver_confirmed_payment,
          closed_at,
          dispute_reason,
          dispute_opened_at,
          driver_bids (
            id,
            driver_id,
            created_at,
            driver:driver_id (
              id,
              name,
              phone,
              rating,
              total_deliveries
            )
          )
        `
        )
        .eq("id", id)
        .eq("seller_id", sellerId)
        .maybeSingle();

      if (error) {
        console.error(error);
        setError("Хүргэлтийн мэдээлэл татахад алдаа гарлаа.");
        setDelivery(null);
        setBids([]);
        return;
      }

      if (!data) {
        setError("Ийм хүргэлт олдсонгүй.");
        setDelivery(null);
        setBids([]);
        return;
      }

      const d = data as any;
      const detail: DeliveryDetail = {
        id: d.id,
        seller_id: d.seller_id,
        from_address: d.from_address,
        to_address: d.to_address,
        note: d.note,
        status: d.status,
        created_at: d.created_at,
        price_mnt: d.price_mnt,
        delivery_type: d.delivery_type,
        chosen_driver_id: d.chosen_driver_id,
        seller_marked_paid: !!d.seller_marked_paid,
        driver_confirmed_payment: !!d.driver_confirmed_payment,
        closed_at: d.closed_at,
        dispute_reason: d.dispute_reason,
        dispute_opened_at: d.dispute_opened_at,
      };

      const bidRows: DriverBidRow[] = Array.isArray(d.driver_bids)
        ? d.driver_bids.map((b: any) => ({
            id: b.id,
            driver_id: b.driver_id,
            created_at: b.created_at,
            driver: b.driver
              ? {
                  id: b.driver.id,
                  name: b.driver.name,
                  phone: b.driver.phone,
                  rating: b.driver.rating,
                  total_deliveries: b.driver.total_deliveries,
                }
              : null,
          }))
        : [];

      setDelivery(detail);
      setBids(bidRows);
    } finally {
      setLoadingDetail(false);
    }
  }

  /* ===========================
   * BLOCK 7 — LOGOUT
   * =========================== */

  function handleLogout() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("incomeUser");
    }
    router.push("/");
  }

  /* ===========================
   * BLOCK 8 — DRIVER SELECT (OPEN → ASSIGNED)
   * =========================== */

  async function handleSelectDriver(driverId: string) {
    if (!delivery || !user) return;

    if (delivery.status !== "OPEN") {
      setMessage("Жолоочийг зөвхөн нээлттэй хүргэлт дээр сонгож болно.");
      return;
    }

    setAssigningId(driverId);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("deliveries")
        .update({
          chosen_driver_id: driverId,
          status: "ASSIGNED",
        })
        .eq("id", delivery.id)
        .eq("seller_id", user.id);

      if (error) {
        console.error(error);
        setError("Жолоочийг сонгоход алдаа гарлаа.");
        return;
      }

      setDelivery({
        ...delivery,
        chosen_driver_id: driverId,
        status: "ASSIGNED",
      });

      setMessage("Жолооч амжилттай сонголоо.");
    } finally {
      setAssigningId(null);
    }
  }

  /* ===========================
   * BLOCK 9 — ASSIGNED → PICKED_UP
   * =========================== */

  async function handleMarkPickedUp() {
    if (!delivery || !user) return;

    if (delivery.status !== "ASSIGNED" || !delivery.chosen_driver_id) {
      setMessage("Эхлээд жолоочийг сонгосон байх ёстой.");
      return;
    }

    setMarkingPickedUp(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("deliveries")
        .update({ status: "PICKED_UP" })
        .eq("id", delivery.id)
        .eq("seller_id", user.id);

      if (error) {
        console.error(error);
        setError("Хүргэлтэд гарсан гэж тэмдэглэхэд алдаа гарлаа.");
        return;
      }

      setDelivery({ ...delivery, status: "PICKED_UP" });
      setMessage("Хүргэлтэд гарсан гэж тэмдэглэлээ.");
    } finally {
      setMarkingPickedUp(false);
    }
  }

  /* ===========================
   * BLOCK 10 — DISPUTE OPEN (Маргаан нээх)
   * =========================== */

  const canOpenDispute =
    !!delivery &&
    !!delivery.chosen_driver_id &&
    canOpenDisputeForSeller(delivery.status);

  async function handleOpenDisputeConfirm() {
    if (!delivery || !user || !delivery.chosen_driver_id) return;

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
        .eq("seller_id", user.id);

      if (error) {
        console.error(error);
        setError("Маргаан нээхэд алдаа гарлаа.");
        return;
      }

      setDelivery({
        ...delivery,
        status: "DISPUTE",
        dispute_reason: reason,
      });

      setShowDisputeModal(false);
      setDisputeReason("");
      setMessage("Маргаан амжилттай нээгдлээ.");
    } finally {
      setOpeningDispute(false);
    }
  }

  /* ===========================
   * BLOCK 11 — CANCEL DRIVER (ASSIGNED → OPEN + блок)
   * =========================== */

  const canCancelDriver =
    !!delivery && delivery.status === "ASSIGNED" && !!delivery.chosen_driver_id;

  function toggleCancelReason(key: keyof typeof cancelReasons) {
    setCancelReasons((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleCancelDriverConfirm() {
    if (!delivery || !user || !delivery.chosen_driver_id) return;

    const labels: string[] = [];
    if (cancelReasons.no_show) labels.push("Ирээгүй");
    if (cancelReasons.too_late) labels.push("Хэт удсан");
    if (cancelReasons.no_contact) labels.push("Утас холбогдохгүй");
    if (cancelReasons.bad_attitude) labels.push("Харилцаа таалагдаагүй");
    if (cancelOtherReason.trim()) labels.push(cancelOtherReason.trim());

    if (labels.length === 0) {
      setError("Жолоочийг цуцлах шалтгаанаа сонгоно уу.");
      return;
    }

    const reasonText = labels.join(" / ");
    const blockedDriverId = delivery.chosen_driver_id;

    setCancelling(true);
    setError(null);
    setMessage(null);

    try {
      const { error: blockError } = await supabase
        .from("seller_blocked_drivers")
        .insert({
          seller_id: user.id,
          driver_id: blockedDriverId,
          reason: reasonText,
        });

      if (blockError) {
        console.error(blockError);
        setError("Жолоочийг цуцлахад алдаа гарлаа (блок хэсэг).");
        return;
      }

      const { error: updError } = await supabase
        .from("deliveries")
        .update({
          status: "OPEN",
          chosen_driver_id: null,
        })
        .eq("id", delivery.id)
        .eq("seller_id", user.id);

      if (updError) {
        console.error(updError);
        setError("Хүргэлтийг нээлттэй болгоход алдаа гарлаа.");
        return;
      }

      setDelivery({
        ...delivery,
        status: "OPEN",
        chosen_driver_id: null,
      });

      setBids((prev) => prev.filter((b) => b.driver_id !== blockedDriverId));

      setShowCancelModal(false);
      setCancelReasons({
        no_show: false,
        too_late: false,
        no_contact: false,
        bad_attitude: false,
      });
      setCancelOtherReason("");

      setMessage(
        "Жолоочийг цуцалж, энэ хүргэлтийг дахин нээлттэй болголоо. Энэ жолооч таны дараагийн хүргэлтүүд дээр харагдахгүй."
      );
    } finally {
      setCancelling(false);
    }
  }

  /* ===========================
   * BLOCK 12 — RATING & CLOSE
   * =========================== */

  async function handleCloseDelivery() {
    if (!delivery || !user) return;

    if (delivery.status !== "DELIVERED") {
      setMessage("Энэ хүргэлт одоогоор хүргээгүй байдалтай байна.");
      return;
    }

    if (!delivery.chosen_driver_id) {
      setMessage("Жолооч сонгогдоогүй байна.");
      return;
    }

    if (ratingStars < 1) {
      setError("Жолоочид өгөх одоо сонгоно уу.");
      return;
    }

    setClosing(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase.from("ratings").insert({
        delivery_id: delivery.id,
        driver_id: delivery.chosen_driver_id,
        stars: ratingStars,
        comment: ratingComment.trim() || null,
      });

      if (error) {
        console.error(error);
        setError("Үнэлгээ хадгалахад алдаа гарлаа.");
        return;
      }

      setMessage("Жолоочид үнэлгээ амжилттай өглөө.");
      setTimeout(() => {
        router.push(backUrl);
      }, 800);
    } finally {
      setClosing(false);
    }
  }

  /* ===========================
   * BLOCK 13 — SELLER PAID TOGGLE
   * =========================== */

  async function handleSellerPaid() {
    if (!delivery || !user) return;

    if (delivery.status !== "DELIVERED") {
      setError("Зөвхөн хүргэсэн хүргэлт дээр төлбөр тэмдэглэнэ.");
      return;
    }

    setPayLoading(true);
    setError(null);
    setMessage(null);

    try {
      const newSellerMarked = !delivery.seller_marked_paid;

      const willBeClosed =
        newSellerMarked && delivery.driver_confirmed_payment;

      const { error } = await supabase
        .from("deliveries")
        .update({
          seller_marked_paid: newSellerMarked,
          status: willBeClosed ? "CLOSED" : delivery.status,
          closed_at: willBeClosed
            ? new Date().toISOString()
            : delivery.closed_at,
        })
        .eq("id", delivery.id)
        .eq("seller_id", user.id);

      if (error) {
        console.error("SELLER PAID ERROR:", error);
        setError("Төлбөр төлснөө тэмдэглэхэд алдаа гарлаа.");
        return;
      }

      setDelivery({
        ...delivery,
        seller_marked_paid: newSellerMarked,
        status: willBeClosed ? "CLOSED" : delivery.status,
        closed_at: willBeClosed
          ? new Date().toISOString()
          : delivery.closed_at,
      });

      setMessage(
        newSellerMarked
          ? "Жолоочид төлбөр шилжүүлснээ тэмдэглэлээ."
          : "Жолоочид төлбөр шилжүүлээгүй гэж заслаа."
      );
    } finally {
      setPayLoading(false);
    }
  }

  /* ===========================
   * BLOCK 14 — STAR RATING UI
   * =========================== */

  function renderStars() {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const active = ratingStars >= star;
          return (
            <button
              key={star}
              type="button"
              onClick={() => setRatingStars(star)}
              className="text-xl"
            >
              <span className={active ? "text-amber-400" : "text-slate-300"}>
                ★
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  /* ===========================
   * BLOCK 15 — LOADING / ERROR / BASIC FLAGS
   * =========================== */

  if (loadingUser || loadingDetail) {
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

  const chosenBid = delivery.chosen_driver_id
    ? bids.find((b) => b.driver_id === delivery.chosen_driver_id) || null
    : null;

  const hasChosenDriver = !!delivery.chosen_driver_id && !!chosenBid;
  const isOpen = delivery.status === "OPEN";
  const isAssigned = delivery.status === "ASSIGNED";
  const isPickedUp = delivery.status === "PICKED_UP";
  const isDelivered = delivery.status === "DELIVERED";

  const sellerPaid = !!delivery.seller_marked_paid;
  const driverConfirmed = !!delivery.driver_confirmed_payment;

  let driverSectionTitle = "Жолоочийн мэдээлэл";
  if (isOpen && !hasChosenDriver) {
    driverSectionTitle = "Жолоочийн авах хүсэлтүүд";
  }

  /* ===========================
   * BLOCK 16 — MAIN UI
   * =========================== */

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
                  Хүргэлтийн дэлгэрэнгүй
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
            нээгдсэн. Тухайн жолоочийн аккаунт түр хаагдсан байгаа.
          </div>
        )}

        {delivery.status === "RETURNED" && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Энэ хүргэлт <span className="font-semibold">буцаасан</span> төлөвт
            байна.
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

        {/* Карт 1 – Хаяг, юу хүргэх */}
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
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-500">
                ХҮРГЭХ ХАЯГ
              </div>
              <p className="mt-1">{shorten(delivery.to_address)}</p>
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

        {/* Карт 2 – Жолооч / санал */}
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              {driverSectionTitle}
            </h2>
            <div className="flex items-center gap-2">
              {isOpen && !hasChosenDriver && (
                <span className="text-[11px] text-slate-500">
                  Нийт: {bids.length}
                </span>
              )}

              {hasChosenDriver && (
                <button
                  type="button"
                  onClick={() => setShowDriverInfoModal(true)}
                  className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Жолоочийн дэлгэрэнгүй
                </button>
              )}
            </div>
          </div>

          {hasChosenDriver ? (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50/60 px-3 py-3 flex items-center justify-between gap-3">
              <div className="space-y-1 text-xs text-slate-700">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">
                    {chosenBid?.driver?.name || "Жолооч"}
                  </span>
                  <span className="text-[10px] rounded-full bg-emerald-600 text-white px-2 py-0.5">
                    {isPickedUp || isDelivered
                      ? "Энэ хүргэлтийг хийж буй жолооч"
                      : "Сонгосон жолооч"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Утас:{" "}
                  {chosenBid?.driver?.phone || "утасны дугаар бүртгэгдээгүй"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {driverRatingText(chosenBid?.driver || null)}
                </p>
                <p className="text-[10px] text-slate-400">
                  Санал илгээсэн:{" "}
                  {formatDateTime(chosenBid?.created_at || "")}
                </p>
              </div>
            </div>
          ) : isOpen ? (
            bids.length === 0 ? (
              <p className="text-xs text-slate-500">
                Одоогоор жолооч авах хүсэлт илгээгээгүй байна.
              </p>
            ) : (
              <div className="space-y-2">
                {bids.map((bid) => {
                  const disabled =
                    assigningId === bid.driver_id || !!delivery.chosen_driver_id;

                  return (
                    <div
                      key={bid.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="space-y-1 text-xs text-slate-700">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">
                            {bid.driver?.name || "Жолооч"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Утас:{" "}
                          {bid.driver?.phone ||
                            "утасны дугаар бүртгэгдээгүй"}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {driverRatingText(bid.driver)}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Санал илгээсэн: {formatDateTime(bid.created_at)}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <button
                          onClick={() => handleSelectDriver(bid.driver_id)}
                          disabled={disabled}
                          className="text-[11px] px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {assigningId === bid.driver_id
                            ? "Сонгож байна…"
                            : "Энэ жолоочийг сонгох"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <p className="text-xs text-slate-500">
              Одоогоор жолооч сонгогдоогүй байна.
            </p>
          )}
        </section>

        {/* Карт 3 – Хүргэлтийн явц / Төлбөр / Маргаан / Цуцлалт / Үнэлгээ */}
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Хүргэлтийн явц, шийдвэр
          </h2>

          {/* Хүргэлтэд гарсан */}
          {delivery.status === "ASSIGNED" && delivery.chosen_driver_id && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-600">
                Жолооч сонгогдсон байна. Жолооч барааг аваад явсан үед{" "}
                <span className="font-medium">“Хүргэлтэд гарсан”</span> гэж
                тэмдэглэнэ.
              </p>
              <button
                onClick={handleMarkPickedUp}
                disabled={markingPickedUp}
                className="text-[11px] px-4 py-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {markingPickedUp ? "Тэмдэглэж байна…" : "Хүргэлтэд гарсан"}
              </button>
            </div>
          )}

          {/* Жолоочийг цуцлах */}
          {canCancelDriver && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 mt-2">
              <p className="text-xs text-slate-600">
                Сонгогдсон жолооч{" "}
                <span className="font-medium">
                  ирээгүй, хэт удсан, утас холбогдохгүй эсвэл харилцаа
                  таалагдаагүй
                </span>{" "}
                бол жолоочийг цуцлаж, энэ хүргэлтийг дахин нээлттэй болгох
                боломжтой.
              </p>
              <button
                onClick={() => setShowCancelModal(true)}
                className="text-[11px] px-4 py-2 rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              >
                Жолоочийг цуцлах
              </button>
            </div>
          )}

          {/* Маргаан үүсгэх */}
          {canOpenDispute && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 mt-2">
              <p className="text-xs text-slate-600">
                Жолооч барааг авчихаад удаан хугацаанд холбоо барихгүй, хүргэлт
                гүйцэтгээгүй тохиолдолд{" "}
                <span className="font-semibold text-rose-700">
                  маргаан нээж
                </span>{" "}
                болно. Маргаан нээхэд тухайн жолоочийн аккаунт системээс
                хаагдана.
              </p>
              <button
                onClick={() => setShowDisputeModal(true)}
                className="text-[11px] px-4 py-2 rounded-full border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              >
                Маргаан үүсгэх
              </button>
            </div>
          )}

          {/* Төлбөр тэмдэглэх (DELIVERED) */}
          {delivery.status === "DELIVERED" && (
            <div className="border-t border-slate-100 pt-3 mt-2 space-y-2">
              {!sellerPaid ? (
                <>
                  <p className="text-xs text-slate-600">
                    Жолооч барааг хүргэсэн байна. Жолоочид төлбөрөө шилжүүлсний
                    дараа{" "}
                    <span className="font-semibold">“Төлбөр төлсөн”</span> гэж
                    тэмдэглэнэ үү.
                  </p>
                  <button
                    onClick={handleSellerPaid}
                    disabled={payLoading}
                    className="text-[11px] px-4 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {payLoading ? "Тэмдэглэж байна…" : "Төлбөр төлсөн"}
                  </button>
                </>
              ) : (
                <p className="text-xs text-emerald-700">
                  Та жолоочид төлбөр шилжүүлсэн гэж тэмдэглэсэн. Жолооч төлбөр
                  авснаа баталсны дараа энэ хүргэлт{" "}
                  <span className="font-semibold">“Хаагдсан”</span> төлөвт
                  автоматаар шилжинэ.
                </p>
              )}
            </div>
          )}

          {/* Үнэлгээ */}
          {delivery.status === "DELIVERED" && delivery.chosen_driver_id && (
            <div className="border-t border-slate-100 pt-3 mt-2 space-y-3">
              <p className="text-xs text-slate-600">
                Хүргэлт амжилттай дууссан бол жолоочид од өгч үнэлнэ үү.
              </p>

              <div className="flex flex-col gap-2">
                {renderStars()}
                <textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Сэтгэгдэл (заавал биш)…"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleCloseDelivery}
                  disabled={closing}
                  className="text-[11px] px-4 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {closing ? "Илгээж байна…" : "Үнэлгээ илгээх"}
                </button>
              </div>
            </div>
          )}

          {/* Төлбөрийн суммари */}
          <div className="border-t border-slate-100 pt-3 mt-2 space-y-1">
            <p className="text-[11px] text-slate-500">
              Худалдагч:{" "}
              <span
                className={
                  sellerPaid
                    ? "text-emerald-600 font-semibold"
                    : "text-slate-700"
                }
              >
                {sellerPaid ? "Жолоочид мөнгөө шилжүүлсэн" : "Мөнгөө шилжүүлээгүй"}
              </span>
            </p>
            <p className="text-[11px] text-slate-500">
              Жолооч:{" "}
              <span
                className={
                  driverConfirmed
                    ? "text-emerald-600 font-semibold"
                    : "text-slate-700"
                }
              >
                {driverConfirmed ? "Төлбөрөө бүрэн авсан" : "Баталгаажаагүй"}
              </span>
            </p>
            {delivery.closed_at && (
              <p className="text-[11px] text-slate-400">
                Хаагдсан: {formatDateTime(delivery.closed_at)}
              </p>
            )}
          </div>

          {delivery.status === "CLOSED" && (
            <div className="border-t border-slate-100 pt-3 mt-2">
              <p className="text-xs text-slate-600">
                Энэ хүргэлт{" "}
                <span className="font-semibold">хаагдсан</span>. Хоёр талын
                төлбөр бүрэн тооцоо хийгдсэн.
              </p>
            </div>
          )}
        </section>

        {/* Жолоочийн дэлгэрэнгүй modal */}
        {showDriverInfoModal && hasChosenDriver && chosenBid && (
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4">
            <div className="max-w-md w-full rounded-2xl bg-white shadow-lg border border-slate-200 px-4 py-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Жолоочийн мэдээлэл
              </h3>

              <div className="space-y-1 text-xs text-slate-700">
                <p>
                  <span className="font-semibold">Нэр:</span>{" "}
                  {chosenBid.driver?.name || "Бүртгэгдээгүй"}
                </p>
                <p>
                  <span className="font-semibold">Утас:</span>{" "}
                  {chosenBid.driver?.phone || "утасны дугаар бүртгэгдээгүй"}
                </p>
                <p>
                  <span className="font-semibold">Үнэлгээ:</span>{" "}
                  {driverRatingText(chosenBid.driver || null)}
                </p>

                <p className="mt-2 text-[11px] text-slate-500">
                  Машины улсын дугаар, марк, регистрийн дугаар, гэрийн хаяг,
                  иргэний үнэмлэхний зураг зэрэг мэдээллийг жолооч{" "}
                  <span className="font-semibold">
                    өөрийн профайл дээр бүрэн бөглөсний
                  </span>{" "}
                  дараа энд харагдана. Тэдгээрийг бүрэн баталгаажуулаагүй
                  жолоочид системээр хүргэлт хийх эрх олгогдохгүй.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDriverInfoModal(false)}
                  className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Хаах
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Маргаан modal */}
        {showDisputeModal && (
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4">
            <div className="max-w-md w-full rounded-2xl bg-white shadow-lg border border-slate-200 px-4 py-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Маргаан үүсгэх
              </h3>
              <p className="text-xs text-slate-600">
                Жолооч барааг аваад удаан хугацаанд холбоо барихгүй, хүргэлт
                гүйцэтгээгүй, эсвэл ноцтой зөрчил гаргасан үед л маргаан
                нээнэ. Маргаан нээснээр тухайн жолооч системээр дахин хүргэлт
                хийх боломжгүй болно.
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

        {/* Жолоочийг цуцлах modal */}
        {showCancelModal && (
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4">
            <div className="max-w-md w-full rounded-2xl bg-white shadow-lg border border-slate-200 px-4 py-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Сонгогдсон жолоочийг цуцлах
              </h3>
              <p className="text-xs text-slate-600">
                Жолооч ирээгүй, хэт удсан, утас холбогдохгүй эсвэл харилцаа
                таалагдаагүй үед жолоочийг цуцалж, энэ хүргэлтийг дахин
                нээлттэй болгоно. Энэ жолооч таны дараагийн хүргэлтүүд дээр
                харагдахгүй.
              </p>

              <div className="space-y-1 text-xs text-slate-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cancelReasons.no_show}
                    onChange={() => toggleCancelReason("no_show")}
                    className="h-3 w-3 rounded border-slate-300"
                  />
                  <span>Ирээгүй</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cancelReasons.too_late}
                    onChange={() => toggleCancelReason("too_late")}
                    className="h-3 w-3 rounded border-slate-300"
                  />
                  <span>Хэт удсан</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cancelReasons.no_contact}
                    onChange={() => toggleCancelReason("no_contact")}
                    className="h-3 w-3 rounded border-slate-300"
                  />
                  <span>Утас холбогдохгүй болсон</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cancelReasons.bad_attitude}
                    onChange={() => toggleCancelReason("bad_attitude")}
                    className="h-3 w-3 rounded border-slate-300"
                  />
                  <span>Харилцаа таалагдаагүй</span>
                </label>
                <div className="pt-1">
                  <textarea
                    value={cancelOtherReason}
                    onChange={(e) => setCancelOtherReason(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
                    placeholder="Бусад (заавал биш)…"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancelling}
                  className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Болих
                </button>
                <button
                  type="button"
                  onClick={handleCancelDriverConfirm}
                  disabled={cancelling}
                  className="text-[11px] px-3 py-1.5 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {cancelling ? "Цуцалж байна…" : "Жолоочийг цуцлах"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
