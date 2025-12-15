"use client";

/* ===========================
 * app/seller/delivery/[id]/page.tsx (FINAL)
 *
 * ✅ 7 сайжруулалтын энэ хуудсанд хамаарах дүрэм:
 * 1) UI: Хаанаас/хаашаа/тайлбар/үнэ нь тус тусдаа section
 * 2) "Хүргэлт гарсан" зөвхөн ASSIGNED (жолооч сонгосны дараа) үед л харагдана
 * 3) "Маргаан" зөвхөн ON_ROUTE / DELIVERED үед л харагдана
 * 5) DISPUTE дээр "Шийдэгдсэн" товч байна
 * 6) "Хаагдсан" бүлгийн (CLOSED/DELIVERED/CANCELLED) хүргэлтүүдийг seller_hidden=true болгож устгаж (нууж) болно
 * + Map: pickup (ногоон) -> dropoff (улаан) нум зураастай preview (координат байвал)
 * =========================== */

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DeliveryRouteMap from "../../../components/Map/DeliveryRouteMap";
import {
  DeliveryStatus,
  getSellerTabForStatus,
  shouldCloseDelivery,
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

  // ✅ Map coords
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;

  status: DeliveryStatus;
  created_at: string;
  price_mnt: number | null;
  delivery_type: string | null;

  chosen_driver_id: string | null;

  seller_marked_paid: boolean;
  driver_confirmed_payment: boolean;
  closed_at: string | null;

  dispute_reason: string | null;
  dispute_opened_at: string | null;

  seller_hidden: boolean;
};

type DriverPublic = {
  id: string;
  name: string | null;
  phone: string | null;
};

type BidRow = {
  id: string;
  driver_id: string;
  created_at: string;
  driver: DriverPublic | null;
};

// ---------------- helpers ----------------

function fmtPrice(n: number | null | undefined) {
  const v = Number(n || 0);
  return v ? `${v.toLocaleString("mn-MN")}₮` : "Үнэ тохиролцоно";
}

function fmtDT(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("mn-MN", { hour12: false });
  } catch {
    return iso;
  }
}

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

function badge(status: DeliveryStatus) {
  switch (status) {
    case "OPEN":
      return { text: "Нээлттэй", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" };
    case "ASSIGNED":
      return { text: "Жолооч сонгосон", cls: "bg-sky-50 text-sky-700 border-sky-100" };
    case "ON_ROUTE":
      return { text: "Замд", cls: "bg-indigo-50 text-indigo-700 border-indigo-100" };
    case "DELIVERED":
      return { text: "Хүргэсэн", cls: "bg-amber-50 text-amber-700 border-amber-100" };
    case "DISPUTE":
      return { text: "Маргаан", cls: "bg-rose-50 text-rose-700 border-rose-100" };
    case "CLOSED":
      return { text: "Хаагдсан", cls: "bg-slate-50 text-slate-700 border-slate-200" };
    case "CANCELLED":
      return { text: "Цуцалсан", cls: "bg-rose-50 text-rose-700 border-rose-100" };
    default:
      return { text: status, cls: "bg-slate-50 text-slate-700 border-slate-200" };
  }
}

// ---------------- page ----------------

export default function SellerDeliveryDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();

  const id = params?.id;
  const backTab = sp.get("tab");

  const [user, setUser] = useState<IncomeUser | null>(null);
  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);
  const [bids, setBids] = useState<BidRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingBids, setLoadingBids] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [chooseLoading, setChooseLoading] = useState<string | null>(null);
  const [markOnRouteLoading, setMarkOnRouteLoading] = useState(false);
  const [markPaidLoading, setMarkPaidLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [hideLoading, setHideLoading] = useState(false);

  // dispute
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeLoading, setDisputeLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);

  // ---------------- auth ----------------
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

  // ---------------- fetch ----------------
  useEffect(() => {
    if (!user || !id) return;
    void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  async function fetchAll() {
    setLoading(true);
    setLoadingBids(true);
    setError(null);
    setMsg(null);

    try {
      // delivery
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
          seller_marked_paid,
          driver_confirmed_payment,
          closed_at,
          dispute_reason,
          dispute_opened_at,
          seller_hidden
        `
        )
        .eq("id", id)
        .maybeSingle();

      if (e1 || !data) {
        setDelivery(null);
        setError("Хүргэлтийн мэдээлэл олдсонгүй.");
        return;
      }

      if (data.seller_id !== user!.id) {
        setDelivery(null);
        setError("Энэ хүргэлт таны эрхэнд байхгүй байна.");
        return;
      }

      const d: DeliveryDetail = {
        id: data.id,
        seller_id: data.seller_id,

        from_address: data.from_address,
        to_address: data.to_address,
        note: data.note,

        pickup_lat: (data as any).pickup_lat ?? null,
        pickup_lng: (data as any).pickup_lng ?? null,
        dropoff_lat: (data as any).dropoff_lat ?? null,
        dropoff_lng: (data as any).dropoff_lng ?? null,

        status: data.status as DeliveryStatus,
        created_at: data.created_at,
        price_mnt: data.price_mnt,
        delivery_type: data.delivery_type,

        chosen_driver_id: data.chosen_driver_id,

        seller_marked_paid: !!data.seller_marked_paid,
        driver_confirmed_payment: !!data.driver_confirmed_payment,
        closed_at: data.closed_at,

        dispute_reason: (data as any).dispute_reason ?? null,
        dispute_opened_at: (data as any).dispute_opened_at ?? null,

        seller_hidden: !!(data as any).seller_hidden,
      };

      setDelivery(d);

      // bids (only useful on OPEN, but safe to fetch always)
      const { data: bidRows, error: e2 } = await supabase
        .from("driver_bids")
        .select(
          `
          id,
          driver_id,
          created_at,
          driver:driver_id (
            id,
            name,
            phone
          )
        `
        )
        .eq("delivery_id", id)
        .order("created_at", { ascending: false });

      if (e2) setBids([]);
      else setBids((bidRows as any) || []);
    } finally {
      setLoading(false);
      setLoadingBids(false);
    }
  }

  // ---------------- navigation ----------------
  function goBack() {
    if (backTab) return router.push(`/seller?tab=${encodeURIComponent(backTab)}`);
    if (!delivery) return router.push("/seller?tab=OPEN");
    return router.push(`/seller?tab=${getSellerTabForStatus(delivery.status)}`);
  }

  // ---------------- actions ----------------

  // OPEN -> choose driver -> ASSIGNED
  async function chooseDriver(driverId: string) {
    if (!delivery || !user) return;
    if (delivery.status !== "OPEN") {
      setError("Зөвхөн Нээлттэй үед жолооч сонгоно.");
      return;
    }

    setChooseLoading(driverId);
    setError(null);
    setMsg(null);

    try {
      const { error } = await supabase
        .from("deliveries")
        .update({ status: "ASSIGNED", chosen_driver_id: driverId })
        .eq("id", delivery.id)
        .eq("seller_id", user.id)
        .eq("status", "OPEN");

      if (error) {
        console.error(error);
        setError("Жолооч сонгоход алдаа гарлаа.");
        return;
      }

      setDelivery({ ...delivery, status: "ASSIGNED", chosen_driver_id: driverId });
      setMsg("Жолооч сонголоо.");
      setTimeout(() => router.push("/seller?tab=ASSIGNED"), 350);
    } finally {
      setChooseLoading(null);
    }
  }

  // ASSIGNED -> ON_ROUTE  ✅ (харагдах: зөвхөн ASSIGNED үед)
  async function markOnRoute() {
    if (!delivery || !user) return;

    if (delivery.status !== "ASSIGNED") {
      setError("Зөвхөн 'Жолооч сонгосон' үед 'Хүргэлт гарсан' гэж тэмдэглэнэ.");
      return;
    }
    if (!delivery.chosen_driver_id) {
      setError("Жолооч сонгогдоогүй байна.");
      return;
    }

    setMarkOnRouteLoading(true);
    setError(null);
    setMsg(null);

    try {
      const { error } = await supabase
        .from("deliveries")
        .update({ status: "ON_ROUTE" })
        .eq("id", delivery.id)
        .eq("seller_id", user.id)
        .eq("status", "ASSIGNED");

      if (error) {
        console.error(error);
        setError("Замд гарсан гэж тэмдэглэхэд алдаа гарлаа.");
        return;
      }

      setDelivery({ ...delivery, status: "ON_ROUTE" });
      setMsg("Замд гарсан гэж тэмдэглэлээ.");
      setTimeout(() => router.push("/seller?tab=ON_ROUTE"), 450);
    } finally {
      setMarkOnRouteLoading(false);
    }
  }

  // DELIVERED/CLOSED: seller payment toggle
  async function toggleSellerPaid() {
    if (!delivery || !user) return;

    if (!(delivery.status === "DELIVERED" || delivery.status === "CLOSED")) {
      setError("Зөвхөн 'Хүргэсэн' үед төлбөр тэмдэглэнэ.");
      return;
    }

    setMarkPaidLoading(true);
    setError(null);
    setMsg(null);

    try {
      const nextPaid = !delivery.seller_marked_paid;

      const willClose = shouldCloseDelivery({
        status: delivery.status,
        seller_marked_paid: nextPaid,
        driver_confirmed_payment: delivery.driver_confirmed_payment,
      });

      const nextStatus: DeliveryStatus = willClose ? "CLOSED" : delivery.status;
      const closedAt = willClose ? new Date().toISOString() : delivery.closed_at;

      const { error } = await supabase
        .from("deliveries")
        .update({
          seller_marked_paid: nextPaid,
          status: nextStatus,
          closed_at: closedAt,
        })
        .eq("id", delivery.id)
        .eq("seller_id", user.id);

      if (error) {
        console.error(error);
        setError("Төлбөр тэмдэглэхэд алдаа гарлаа.");
        return;
      }

      setDelivery({
        ...delivery,
        seller_marked_paid: nextPaid,
        status: nextStatus,
        closed_at: closedAt,
      });

      setMsg(nextPaid ? "Төлбөр төлсөн гэж тэмдэглэлээ." : "Төлбөрийн тэмдэглэгээг цуцаллаа.");
    } finally {
      setMarkPaidLoading(false);
    }
  }

  // cancel -> CANCELLED (seller)
  async function cancelDelivery() {
    if (!delivery || !user) return;

    if (delivery.status === "CLOSED") {
      setError("Хаагдсан хүргэлтийг цуцлах боломжгүй.");
      return;
    }
    if (delivery.status === "CANCELLED") {
      setError("Энэ хүргэлт аль хэдийн цуцлагдсан.");
      return;
    }

    setCancelLoading(true);
    setError(null);
    setMsg(null);

    try {
      const { error } = await supabase
        .from("deliveries")
        .update({ status: "CANCELLED" })
        .eq("id", delivery.id)
        .eq("seller_id", user.id);

      if (error) {
        console.error(error);
        setError("Цуцлахад алдаа гарлаа.");
        return;
      }

      setDelivery({ ...delivery, status: "CANCELLED" });
      setMsg("Хүргэлт цуцлагдлаа.");
      setTimeout(() => router.push("/seller?tab=CLOSED"), 350);
    } finally {
      setCancelLoading(false);
    }
  }

  // ✅ "Хаагдсан" бүлгийн хүргэлтийг устгах (seller_hidden=true)
  // (CLOSED / DELIVERED / CANCELLED дээр ажиллана)
  const canHideFromClosedGroup = useMemo(() => {
    if (!delivery) return false;
    return (
      delivery.status === "CLOSED" ||
      delivery.status === "DELIVERED" ||
      delivery.status === "CANCELLED"
    );
  }, [delivery]);

  async function hideFromClosedGroup() {
    if (!delivery || !user) return;

    if (!canHideFromClosedGroup) {
      setError("Зөвхөн хаагдсан бүлгийн (Хаагдсан/Хүргэсэн/Цуцалсан) хүргэлтийг л устгаж (нууж) болно.");
      return;
    }

    setHideLoading(true);
    setError(null);
    setMsg(null);

    try {
      const { error } = await supabase
        .from("deliveries")
        .update({ seller_hidden: true })
        .eq("id", delivery.id)
        .eq("seller_id", user.id);

      if (error) {
        console.error(error);
        setError("Устгах (нуух) үед алдаа гарлаа.");
        return;
      }

      setMsg("Хаагдсан хүргэлтийг устгалаа (нууснаа).");
      setTimeout(() => router.push("/seller?tab=CLOSED"), 450);
    } finally {
      setHideLoading(false);
    }
  }

  // ✅ Маргаан нээх боломж (Зөвхөн ON_ROUTE / DELIVERED)
  const canOpenDispute = useMemo(() => {
    if (!delivery) return false;
    if (delivery.status === "DISPUTE") return false;
    return delivery.status === "ON_ROUTE" || delivery.status === "DELIVERED";
  }, [delivery]);

  async function openDispute() {
    if (!delivery || !user) return;

    const reason = disputeReason.trim();
    if (!reason) {
      setError("Маргааны шалтгаанаа бичнэ үү.");
      return;
    }
    if (!canOpenDispute) {
      setError("Энэ төлөв дээр маргаан нээх боломжгүй.");
      return;
    }

    setDisputeLoading(true);
    setError(null);
    setMsg(null);

    try {
      const openedAt = new Date().toISOString();

      const { error } = await supabase
        .from("deliveries")
        .update({
          status: "DISPUTE",
          dispute_reason: reason,
          dispute_opened_at: openedAt,
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
        dispute_opened_at: openedAt,
      });

      setShowDispute(false);
      setDisputeReason("");
      setMsg("Маргаан нээгдлээ.");
      setTimeout(() => router.push("/seller?tab=DISPUTE"), 450);
    } finally {
      setDisputeLoading(false);
    }
  }

  // ✅ Маргааныг "Шийдэгдсэн" болгох (DISPUTE -> CLOSED)
  async function resolveDispute() {
    if (!delivery || !user) return;
    if (delivery.status !== "DISPUTE") return;

    setResolveLoading(true);
    setError(null);
    setMsg(null);

    try {
      const closedAt = new Date().toISOString();

      const { error } = await supabase
        .from("deliveries")
        .update({
          status: "CLOSED",
          closed_at: closedAt,
        })
        .eq("id", delivery.id)
        .eq("seller_id", user.id)
        .eq("status", "DISPUTE");

      if (error) {
        console.error(error);
        setError("Маргааныг шийдэгдсэн болгоход алдаа гарлаа.");
        return;
      }

      setDelivery({ ...delivery, status: "CLOSED", closed_at: closedAt });
      setMsg("Маргаан шийдэгдлээ. Хүргэлт хаагдлаа.");
      setTimeout(() => router.push("/seller?tab=CLOSED"), 450);
    } finally {
      setResolveLoading(false);
    }
  }

  // ---------------- UI ----------------

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          <div className="h-10 w-32 bg-slate-200 rounded-xl animate-pulse" />
          <div className="h-28 bg-white border border-slate-200 rounded-2xl animate-pulse" />
          <div className="h-44 bg-white border border-slate-200 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const t = typeLabel(delivery?.delivery_type ?? null);
  const b = delivery ? badge(delivery.status) : null;

  const hasMap =
    !!delivery &&
    delivery.pickup_lat != null &&
    delivery.pickup_lng != null &&
    delivery.dropoff_lat != null &&
    delivery.dropoff_lng != null;

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* header */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={goBack}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            ← Буцах
          </button>

          {delivery && b && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{t.icon}</span>
              <span className={`text-[11px] px-3 py-1.5 rounded-full border ${b.cls}`}>
                {b.text}
              </span>
            </div>
          )}
        </div>

        {/* alerts */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {msg && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {msg}
          </div>
        )}

        {!delivery ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6">
            <p className="text-sm text-slate-700">Хүргэлтийн мэдээлэл олдсонгүй.</p>
          </div>
        ) : (
          <>
            {/* main card */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h1 className="text-lg font-semibold text-slate-900">
                    {t.label} #{delivery.id.slice(0, 6)}
                  </h1>
                  <p className="text-xs text-slate-500">Үүсгэсэн: {fmtDT(delivery.created_at)}</p>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-500">Үнэ</div>
                  <div className="text-base font-semibold text-slate-900">{fmtPrice(delivery.price_mnt)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">АВАХ</div>
                  <div className="text-sm text-slate-900 mt-1">{delivery.from_address || "—"}</div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">ХҮРГЭХ</div>
                  <div className="text-sm text-slate-900 mt-1">{delivery.to_address || "—"}</div>
                </div>
              </div>

              {delivery.note && (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-[11px] text-slate-500">Тайлбар</div>
                  <div className="text-sm text-slate-900 mt-1 whitespace-pre-wrap">{delivery.note}</div>
                </div>
              )}

              {delivery.status === "DISPUTE" && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <div className="text-sm font-semibold text-rose-800">Маргаантай</div>
                  <div className="text-xs text-rose-700 mt-1 whitespace-pre-wrap">
                    {delivery.dispute_reason || "—"}
                  </div>
                  <div className="text-[11px] text-rose-600 mt-1">
                    Нээсэн: {fmtDT(delivery.dispute_opened_at)}
                  </div>
                </div>
              )}
            </section>

            {/* map preview */}
            {hasMap && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">Хүргэлтийн чиглэл</h2>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <DeliveryRouteMap
                    pickup={{ lat: delivery.pickup_lat!, lng: delivery.pickup_lng! }}
                    dropoff={{ lat: delivery.dropoff_lat!, lng: delivery.dropoff_lng! }}
                    height={260}
                  />
                </div>
              </section>
            )}

            {/* actions */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">Үйлдэл</h2>

              {/* OPEN: bids list */}
              {delivery.status === "OPEN" && (
                <div className="space-y-2">
                  <div className="text-xs text-slate-600">Жолооч сонгох:</div>

                  {loadingBids ? (
                    <div className="text-xs text-slate-500">Ачаалж байна…</div>
                  ) : bids.length === 0 ? (
                    <div className="text-xs text-slate-500">Одоогоор санал ирээгүй.</div>
                  ) : (
                    <div className="space-y-2">
                      {bids.map((b) => (
                        <div
                          key={b.id}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {b.driver?.name || "Нэргүй жолооч"}
                            </div>
                            <div className="text-[11px] text-slate-600">
                              {b.driver?.phone ? `📞 ${b.driver.phone}` : "📞 —"} · Илгээсэн:{" "}
                              {fmtDT(b.created_at)}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {b.driver?.phone && (
                              <a
                                href={`tel:${b.driver.phone}`}
                                className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              >
                                Залгах
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => void chooseDriver(b.driver_id)}
                              disabled={chooseLoading === b.driver_id}
                              className="text-[11px] px-4 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {chooseLoading === b.driver_id ? "Сонгож байна…" : "Сонгох"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Quick actions row */}
              <div className="flex flex-wrap items-center gap-2">
                {/* ✅ "Хүргэлт гарсан" — зөвхөн ASSIGNED үед ХАРАГДАНА */}
                {delivery.status === "ASSIGNED" && (
                  <button
                    type="button"
                    onClick={() => void markOnRoute()}
                    disabled={!delivery.chosen_driver_id || markOnRouteLoading}
                    className="text-xs px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    title="ASSIGNED -> ON_ROUTE"
                  >
                    {markOnRouteLoading ? "Тэмдэглэж байна…" : "Хүргэлт гарсан"}
                  </button>
                )}

                {/* ✅ Маргаан — зөвхөн ON_ROUTE/DELIVERED үед ХАРАГДАНА */}
                {(delivery.status === "ON_ROUTE" || delivery.status === "DELIVERED") && (
                  <button
                    type="button"
                    onClick={() => setShowDispute(true)}
                    className="text-xs px-4 py-2 rounded-xl border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  >
                    Маргаан
                  </button>
                )}

                {/* ✅ DISPUTE дээр "Шийдэгдсэн" */}
                {delivery.status === "DISPUTE" && (
                  <button
                    type="button"
                    onClick={() => void resolveDispute()}
                    disabled={resolveLoading}
                    className="text-xs px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    title="DISPUTE -> CLOSED"
                  >
                    {resolveLoading ? "Тэмдэглэж байна…" : "Шийдэгдсэн"}
                  </button>
                )}

                {/* Цуцлах (хаагдсанд бол зөвшөөрөхгүй) */}
                <button
                  type="button"
                  onClick={() => void cancelDelivery()}
                  disabled={cancelLoading || delivery.status === "CLOSED" || delivery.status === "CANCELLED"}
                  className="text-xs px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {cancelLoading ? "Цуцалж байна…" : "Цуцлах"}
                </button>

                {/* ✅ Хаагдсан бүлэг дээр устгах (нуух) */}
                {canHideFromClosedGroup && (
                  <button
                    type="button"
                    onClick={() => void hideFromClosedGroup()}
                    disabled={hideLoading}
                    className="text-xs px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                    title="seller_hidden=true"
                  >
                    {hideLoading ? "Устгаж байна…" : "Хаагдсанаас устгах"}
                  </button>
                )}
              </div>

              {/* Payment block */}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-slate-900">Төлбөр</div>
                    <div className="text-[11px] text-slate-500">
                      Худалдагч:{" "}
                      <span className={delivery.seller_marked_paid ? "text-emerald-700" : "text-slate-600"}>
                        {delivery.seller_marked_paid ? "Төлсөн гэж тэмдэглэсэн" : "Төлөөгүй"}
                      </span>
                      {" · "}
                      Жолооч:{" "}
                      <span className={delivery.driver_confirmed_payment ? "text-emerald-700" : "text-slate-600"}>
                        {delivery.driver_confirmed_payment ? "Авсан гэж баталсан" : "Батлаагүй"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void toggleSellerPaid()}
                    disabled={markPaidLoading || !(delivery.status === "DELIVERED" || delivery.status === "CLOSED")}
                    className="text-xs px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {markPaidLoading
                      ? "Тэмдэглэж байна…"
                      : delivery.seller_marked_paid
                      ? "Төлбөрийн тэмдэглэгээ цуцлах"
                      : "Төлбөр төлснөө батлах"}
                  </button>
                </div>

                {delivery.status === "CLOSED" && (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-sm font-semibold text-emerald-800">Хаагдсан</div>
                    <p className="text-xs text-emerald-700 mt-1">
                      {delivery.closed_at ? `(${fmtDT(delivery.closed_at)})` : ""} Төлбөрийн тооцоо дууссан.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* dispute modal */}
            {showDispute && (
              <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4">
                <div className="max-w-md w-full rounded-2xl bg-white shadow-lg border border-slate-200 px-4 py-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Маргаан үүсгэх (seller)</h3>
                  <p className="text-xs text-slate-600">Товч, тодорхой шалтгаанаа бичнэ үү.</p>
                  <textarea
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                    placeholder="Юу болсон талаар…"
                  />
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowDispute(false)}
                      disabled={disputeLoading}
                      className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      Болих
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (disputeLoading) return;
                        setDisputeLoading(true);
                        try {
                          await openDispute();
                        } finally {
                          setDisputeLoading(false);
                        }
                      }}
                      disabled={disputeLoading}
                      className="text-[11px] px-3 py-1.5 rounded-full bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
                    >
                      {disputeLoading ? "Илгээж байна…" : "Маргаан нээх"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
