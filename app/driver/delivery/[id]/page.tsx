"use client";

/* ===========================
 * app/driver/delivery/[id]/page.tsx (Driver Open Detail — ON_ROUTE buyer-first)
 *
 * ✅ OPEN: хаяг (from/to) нарийн мэдээлэл харагдахгүй
 * ✅ ASSIGNED (PICKUP): зөвхөн авах нарийн хаяг + Google Maps
 * ✅ ON_ROUTE (Замд): авах хаяг ХЭРЭГГҮЙ
 *    - Main card дээр худалдан авагчийн утас(+залгах), бүрэн хаяг(+бүтнээр нь хуулах)
 *    - Google Maps товч + “Хүргэчихлээ” товч ижил өндөртэй
 * ✅ Map aspectRatio="16 / 9"
 * ✅ ?tab=PICKUP үед extra картуудыг нуух (хуучин логик хэвээр)
 *
 * 🔧 FIX: buyer_phone null үед хаяг/дэлгэрэнгүй текстээс 8 оронтой дугаарыг fallback-аар сугалж харуулна.
 * =========================== */

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DeliveryStatus, getDriverTabForStatus } from "@/lib/deliveryLogic";
import DeliveryRouteMap from "@/app/components/Map/DeliveryRouteMap";

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

  pickup_district: string | null;
  pickup_khoroo: string | null;
  dropoff_district: string | null;
  dropoff_khoroo: string | null;

  from_address: string | null;
  to_address: string | null;

  note: string | null;

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

type SellerMini = {
  id: string;
  name: string;
  phone: string;
};

type DriverBid = {
  id: string;
  driver_id: string;
  delivery_id: string;
  created_at: string;
};

type DeliveryPrivate = {
  delivery_id: string;
  to_detail: string | null;
  buyer_phone: string | null;
};

function fmtPrice(n: number | null | undefined) {
  const v = Number(n || 0);
  return v ? `${v.toLocaleString("mn-MN")}₮` : "Үнэ тохиролцоно";
}

function fmtDT(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("mn-MN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function typeLabel(deliveryType: string | null): { icon: string; label: string } {
  const t = String(deliveryType || "").toLowerCase();
  if (t.includes("food")) return { icon: "🍱", label: "Хоол" };
  if (t.includes("fragile")) return { icon: "🥚", label: "Эмзэг" };
  if (t.includes("box")) return { icon: "📦", label: "Илгээмж" };
  return { icon: "📦", label: "Хүргэлт" };
}

function badge(status: DeliveryStatus) {
  switch (status) {
    case "OPEN":
      return { text: "Нээлттэй", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
    case "ASSIGNED":
      return { text: "Жолооч сонгосон", cls: "border-indigo-200 bg-indigo-50 text-indigo-700" };
    case "ON_ROUTE":
      return { text: "Замд", cls: "border-amber-200 bg-amber-50 text-amber-800" };
    case "DELIVERED":
      return { text: "Хүргэсэн", cls: "border-slate-200 bg-slate-50 text-slate-700" };
    case "PAID":
      return { text: "Төлсөн", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
    case "DISPUTE":
      return { text: "Маргаан", cls: "border-rose-200 bg-rose-50 text-rose-700" };
    case "CLOSED":
      return { text: "Хаагдсан", cls: "border-slate-200 bg-slate-50 text-slate-700" };
    case "CANCELLED":
      return { text: "Цуцалсан", cls: "border-slate-200 bg-slate-50 text-slate-600" };
    default:
      return { text: status, cls: "border-slate-200 bg-slate-50 text-slate-700" };
  }
}

function pickErr(e: any, fallback: string) {
  const m = e?.message || e?.error_description || e?.hint;
  return m ? String(m) : fallback;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function areaLine(d?: string | null, k?: string | null) {
  const dd = String(d || "").trim();
  const kk = String(k || "").trim();
  if (dd && kk) return `${dd} ${kk} хороо`;
  if (dd) return dd;
  if (kk) return `${kk} хороо`;
  return "—";
}

function gmapsDirUrl(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) return "";
  const dest = `${lat},${lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    dest
  )}&travelmode=driving&dir_action=navigate`;
}

/** 8 оронтой Монгол утас сугална (99004792, 99-00-47-92, 9900 4792 гэх мэт) */
function extractMnPhone(text: string) {
  const s = String(text || "");
  // эхлээд "Утас:" гэх мэттэй үед илүү зөв тааруулна
  const m1 = s.match(/(?:утас|phone)\s*[:：]?\s*([0-9][0-9\-\s]{6,20}[0-9])/i);
  const candidate = (m1?.[1] || "").replace(/[^\d]/g, "");
  if (candidate.length === 8) return candidate;

  // ерөнхий fallback: 8 цифр
  const m2 = s.replace(/[^\d]/g, "").match(/(\d{8})/);
  return m2?.[1] || "";
}

export default function DriverDeliveryDetailPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const { id } = useParams<{ id: string }>();

  const backTab = sp.get("tab") || "";
  const hidePickupExtras = false; // ✅ BABA: PICKUP дээр extra-гаа нуухгүй (хаяг/Google Maps буцааж гаргана)

  const [user, setUser] = useState<IncomeUser | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);

  const [seller, setSeller] = useState<SellerMini | null>(null);
  const [sellerLoading, setSellerLoading] = useState(false);

  const [myBid, setMyBid] = useState<DriverBid | null>(null);
  const [priv, setPriv] = useState<DeliveryPrivate | null>(null);
  const [privLoading, setPrivLoading] = useState(false);

  const [bidLoading, setBidLoading] = useState(false);
  const [cancelBidLoading, setCancelBidLoading] = useState(false);

  const [markDeliveredLoading, setMarkDeliveredLoading] = useState(false);

  const [confirmPayLoading, setConfirmPayLoading] = useState(false);

  // ---------------- load user ----------------
  useEffect(() => {
    try {
      const raw = localStorage.getItem("incomeUser");
      if (!raw) {
        router.push("/");
        return;
      }
      const u = JSON.parse(raw) as IncomeUser;
      if (!u?.id) {
        router.push("/");
        return;
      }
      setUser(u);
      if (u.role !== "driver") router.push("/seller");
    } catch {
      router.push("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ---------------- fetch ----------------
  useEffect(() => {
    if (!user || !id) return;
    void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  async function fetchSeller(sellerId: string) {
    setSellerLoading(true);
    try {
      const deliveredAt = new Date().toISOString();

      const { data, error } = await supabase
        .from("users")
        .select("id,name,phone")
        .eq("id", sellerId)
        .maybeSingle();
      if (error) {
        console.warn(error);
        setSeller(null);
        return;
      }
      setSeller((data as any) || null);
    } finally {
      setSellerLoading(false);
    }
  }

  async function fetchAll() {
    if (!user) return;

    setLoading(true);
    setError(null);
    setMsg(null);

    try {
      const { data, error: e1 } = await supabase
        .from("deliveries")
        .select(
          `
          id,
          seller_id,
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

      const dBase: DeliveryDetail = {
        id: data.id,
        seller_id: data.seller_id,

        pickup_district: (data as any).pickup_district ?? null,
        pickup_khoroo: (data as any).pickup_khoroo ?? null,
        dropoff_district: (data as any).dropoff_district ?? null,
        dropoff_khoroo: (data as any).dropoff_khoroo ?? null,

        from_address: null,
        to_address: null,

        note: data.note ?? null,

        pickup_lat: (data as any).pickup_lat ?? null,
        pickup_lng: (data as any).pickup_lng ?? null,
        dropoff_lat: (data as any).dropoff_lat ?? null,
        dropoff_lng: (data as any).dropoff_lng ?? null,

        status: data.status as DeliveryStatus,
        created_at: data.created_at,
        price_mnt: data.price_mnt ?? null,
        delivery_type: (data as any).delivery_type ?? null,

        chosen_driver_id: (data as any).chosen_driver_id ?? null,

        seller_marked_paid: !!(data as any).seller_marked_paid,
        driver_confirmed_payment: !!(data as any).driver_confirmed_payment,
        closed_at: (data as any).closed_at ?? null,

        dispute_reason: (data as any).dispute_reason ?? null,
        dispute_opened_at: (data as any).dispute_opened_at ?? null,

        seller_hidden: !!(data as any).seller_hidden,
      };

      setDelivery(dBase);

      void fetchSeller(dBase.seller_id);

      const { data: b, error: e2 } = await supabase
        .from("driver_bids")
        .select("id, driver_id, delivery_id, created_at")
        .eq("delivery_id", dBase.id)
        .eq("driver_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (e2) setMyBid(null);
      else setMyBid((b as any) || null);

      // ✅ Sensitive addresses only when it’s YOUR assigned (privacy)
      const isMine = !!dBase.chosen_driver_id && dBase.chosen_driver_id === user.id;

      const allowPickupDetail =
        isMine &&
        (dBase.status === "ASSIGNED" ||
          dBase.status === "ON_ROUTE" ||
          dBase.status === "DELIVERED" ||
          dBase.status === "PAID" ||
          dBase.status === "DISPUTE" ||
          dBase.status === "CLOSED");

      const allowDropoffDetail =
        isMine &&
        (dBase.status === "ON_ROUTE" ||
          dBase.status === "DELIVERED" ||
          dBase.status === "PAID" ||
          dBase.status === "DISPUTE" ||
          dBase.status === "CLOSED");

      if (allowPickupDetail || allowDropoffDetail) {
        const sel = [
          allowPickupDetail ? "from_address" : null,
          allowDropoffDetail ? "to_address" : null,
        ]
          .filter(Boolean)
          .join(",");

        const { data: sens, error: es } = await supabase
          .from("deliveries")
          .select(sel)
          .eq("id", dBase.id)
          .maybeSingle();

        if (!es && sens) {
          setDelivery((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              from_address: allowPickupDetail ? (sens as any).from_address ?? null : prev.from_address,
              to_address: allowDropoffDetail ? (sens as any).to_address ?? null : prev.to_address,
            };
          });
        }
      }

      await maybeLoadPrivate(dBase);
    } finally {
      setLoading(false);
    }
  }

  // ---------------- navigation ----------------
  function goBack() {
    if (backTab) return router.push(`/driver?tab=${encodeURIComponent(backTab)}`);
    if (!delivery) return router.push("/driver?tab=OFFERS");
    return router.push(`/driver?tab=${getDriverTabForStatus(delivery.status)}`);
  }

  // ---------------- derived ----------------
  const isChosenDriver = useMemo(() => {
    if (!delivery || !user) return false;
    return !!delivery.chosen_driver_id && delivery.chosen_driver_id === user.id;
  }, [delivery, user]);

  const canBid = useMemo(() => {
    if (!delivery) return false;
    return delivery.status === "OPEN";
  }, [delivery]);

  const canMarkDelivered = useMemo(() => {
    if (!delivery) return false;
    return delivery.status === "ON_ROUTE" && isChosenDriver;
  }, [delivery, isChosenDriver]);

  const hasMap =
    !!delivery &&
    delivery.pickup_lat != null &&
    delivery.pickup_lng != null &&
    delivery.dropoff_lat != null &&
    delivery.dropoff_lng != null;

  const pickupArea = useMemo(() => {
    if (!delivery) return "—";
    return areaLine(delivery.pickup_district, delivery.pickup_khoroo);
  }, [delivery]);

  const dropoffArea = useMemo(() => {
    if (!delivery) return "—";
    return areaLine(delivery.dropoff_district, delivery.dropoff_khoroo);
  }, [delivery]);

  // ✅ ON_ROUTE+ дээр pickup нарийн хаягийг огт харуулахгүй
  const pickupDisplay = useMemo(() => {
    if (!delivery) return "—";

    if (delivery.status === "OPEN") return pickupArea;

    if (delivery.status === "ASSIGNED") {
      return isChosenDriver ? delivery.from_address || pickupArea : pickupArea;
    }

    if (
      delivery.status === "ON_ROUTE" ||
      delivery.status === "DELIVERED" ||
      delivery.status === "PAID" ||
      delivery.status === "DISPUTE" ||
      delivery.status === "CLOSED"
    ) {
      return pickupArea;
    }

    return pickupArea;
  }, [delivery, pickupArea, isChosenDriver]);

  const dropoffDisplay = useMemo(() => {
    if (!delivery) return "—";

    if (delivery.status === "OPEN" || delivery.status === "ASSIGNED") return dropoffArea;

    if (
      delivery.status === "ON_ROUTE" ||
      delivery.status === "DELIVERED" ||
      delivery.status === "PAID" ||
      delivery.status === "DISPUTE" ||
      delivery.status === "CLOSED"
    ) {
      return isChosenDriver ? delivery.to_address || dropoffArea : dropoffArea;
    }

    return dropoffArea;
  }, [delivery, dropoffArea, isChosenDriver]);

  const pickupNavUrl = useMemo(() => {
    if (!delivery) return "";
    return gmapsDirUrl(delivery.pickup_lat, delivery.pickup_lng);
  }, [delivery]);

  const dropoffNavUrl = useMemo(() => {
    if (!delivery) return "";
    return gmapsDirUrl(delivery.dropoff_lat, delivery.dropoff_lng);
  }, [delivery]);

  // ✅ ON_ROUTE дээр buyer info-г main card дээр гаргах бүрэн текст
  const buyerFullAddress = useMemo(() => {
    if (!delivery) return "";
    // Дүүрэг/хороо + (to_address) + (to_detail)
    const parts = [dropoffArea, delivery.to_address, priv?.to_detail].filter(Boolean);
    return parts.join(" — ");
  }, [delivery, dropoffArea, priv]);

  const buyerPhone = useMemo(() => {
    // 1) delivery_private.buyer_phone
    const p1 = String(priv?.buyer_phone || "").trim();
    if (p1) return p1.replace(/[^\d]/g, "");

    // 2) to_detail / to_address / fullAddress дотор "Утас: 99004792" байвал сугална
    const p2 = extractMnPhone(`${priv?.to_detail || ""} ${delivery?.to_address || ""} ${buyerFullAddress || ""}`);
    return p2;
  }, [priv, delivery, buyerFullAddress]);

  async function maybeLoadPrivate(d: DeliveryDetail) {
    if (!user) return;

    const isMine = !!d.chosen_driver_id && d.chosen_driver_id === user.id;
    const allowed =
      d.status === "ON_ROUTE" ||
      d.status === "DELIVERED" ||
      d.status === "PAID" ||
      d.status === "DISPUTE" ||
      d.status === "CLOSED";

    if (!isMine || !allowed) {
      setPriv(null);
      return;
    }

    setPrivLoading(true);
    try {
      const deliveredAt = new Date().toISOString();

      const { data, error } = await supabase
        .from("delivery_private")
        .select("delivery_id,to_detail,buyer_phone")
        .eq("delivery_id", d.id)
        .maybeSingle();

      if (error) {
        console.error(error);
        setPriv(null);
        return;
      }

      setPriv((data as any) || null);
    } finally {
      setPrivLoading(false);
    }
  }

  // ---------------- actions ----------------
  async function placeBid() {
    if (!delivery || !user) return;
    if (!canBid) return setError("Зөвхөн Нээлттэй үед хүсэлт илгээнэ.");
    if (bidLoading) return;

    setBidLoading(true);
    setError(null);
    setMsg(null);

    try {
      const deliveredAt = new Date().toISOString();

      const { data, error } = await supabase
        .from("driver_bids")
        .insert({ delivery_id: delivery.id, driver_id: user.id })
        .select("id, driver_id, delivery_id, created_at")
        .maybeSingle();

      if (error) {
        const code = (error as any)?.code;
        if (code === "23505") {
          setMsg("Хүсэлт өмнө нь илгээгдсэн байна.");
          void fetchAll();
          return;
        }
        console.error(error);
        setError(pickErr(error, "Хүсэлт илгээхэд алдаа гарлаа."));
        return;
      }

      setMyBid((data as any) || null);
      setMsg("Хүсэлт илгээлээ.");
    } finally {
      setBidLoading(false);
    }
  }

  async function cancelBid() {
    if (!delivery || !user) return;
    if (cancelBidLoading) return;

    setCancelBidLoading(true);
    setError(null);
    setMsg(null);

    try {
      if (delivery.status === "OPEN") {
        const { error } = await supabase
          .from("driver_bids")
          .delete()
          .eq("delivery_id", delivery.id)
          .eq("driver_id", user.id);

        if (error) {
          console.error(error);
          setError(pickErr(error, "Хүсэлт цуцлахад алдаа гарлаа."));
          return;
        }

        setMyBid(null);
        setMsg("Хүсэлт цуцлагдлаа.");
        return;
      }

      if (delivery.status === "ASSIGNED" && delivery.chosen_driver_id === user.id) {
        await supabase.from("driver_bids").delete().eq("delivery_id", delivery.id).eq("driver_id", user.id);
        setMyBid(null);

        const { data, error } = await supabase
          .from("deliveries")
          .update({ status: "OPEN", chosen_driver_id: null })
          .eq("id", delivery.id)
          .eq("chosen_driver_id", user.id)
          .select("id,status,chosen_driver_id,closed_at")
          .maybeSingle();

        if (error || !data) {
          console.error(error);
          setError(pickErr(error, "Татгалзахад алдаа гарлаа."));
          return;
        }

        setDelivery((d) =>
          d ? { ...d, status: "OPEN", chosen_driver_id: null, from_address: null, to_address: null } : d
        );
        setPriv(null);

        setMsg("Татгалзлаа. Хүргэлт дахин нээлттэй боллоо.");
        router.push("/driver?tab=OFFERS");
        router.refresh();
        return;
      }

      setError("Энэ төлөв дээр цуцлах боломжгүй.");
    } finally {
      setCancelBidLoading(false);
    }
  }

  async function markDelivered() {
    if (!delivery || !user) return;
    if (!(delivery.status === "ON_ROUTE" && isChosenDriver)) return setError("Энэ хүргэлт танд оноогдоогүй байна.");
    if (markDeliveredLoading) return;

    setMarkDeliveredLoading(true);
    setError(null);
    setMsg(null);

    try {
      const deliveredAt = new Date().toISOString();

      const { data, error } = await supabase
        .from("deliveries")
        .update({ status: "DELIVERED", closed_at: deliveredAt })
        .eq("id", delivery.id)
        .eq("status", "ON_ROUTE")
        .eq("chosen_driver_id", user.id)
        .select("id,status,chosen_driver_id,closed_at")
        .maybeSingle();

      if (error || !data) {
        console.error(error);
        setError(pickErr(error, "Хүргэсэн гэж тэмдэглэхэд алдаа гарлаа."));
        return;
      }

      const nd: DeliveryDetail = {
        ...delivery,
        status: "DELIVERED",
        chosen_driver_id: (data as any).chosen_driver_id,
        closed_at: (data as any).closed_at ?? deliveredAt,
      };

      setDelivery(nd);
      void maybeLoadPrivate(nd);

      setMsg("Хүргэсэн гэж тэмдэглэлээ.");
      router.push(`/driver?tab=${getDriverTabForStatus("DELIVERED")}`);
      router.refresh();
    } finally {
      setMarkDeliveredLoading(false);
    }
  }

  async function confirmPaymentReceived() {
    if (!delivery || !user) return;
    if (confirmPayLoading) return;

    if (delivery.status !== "PAID" && delivery.status !== "DELIVERED")
      return setError("Зөвхөн 'Хүргэсэн' эсвэл 'Төлсөн' үед төлбөр хүлээн авснаа батална.");
    if (!isChosenDriver) return setError("Энэ хүргэлт танд оноогдоогүй байна.");
    if (delivery.driver_confirmed_payment) return setError("Төлбөр аль хэдийн баталгаажсан байна.");

    setConfirmPayLoading(true);
    setError(null);
    setMsg(null);

    try {
      const { data, error } = await supabase
        .from("deliveries")
        .update({ driver_confirmed_payment: true })
        .eq("id", delivery.id)
        .eq("chosen_driver_id", user.id)
        .in("status", ["PAID", "DELIVERED"])
        .eq("driver_confirmed_payment", false)
        .select("id,status,driver_confirmed_payment,closed_at,seller_marked_paid,chosen_driver_id")
        .maybeSingle();

      if (error || !data) {
        console.error(error);
        setError(pickErr(error, "Төлбөр батлахад алдаа гарлаа."));
        return;
      }

      const nd: DeliveryDetail = {
        ...delivery,
        driver_confirmed_payment: true,
        status: (data as any).status ?? delivery.status,
        closed_at: (data as any).closed_at ?? delivery.closed_at,
        seller_marked_paid: !!(data as any).seller_marked_paid,
        chosen_driver_id: (data as any).chosen_driver_id ?? delivery.chosen_driver_id,
      };

      setDelivery(nd);
      void maybeLoadPrivate(nd);

      setMsg("Төлбөр хүлээн авснаа баталлаа.");
      router.refresh();
    } finally {
      setConfirmPayLoading(false);
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

  const showSellerCard =
    !!delivery &&
    isChosenDriver &&
    (delivery.status === "ASSIGNED" ||
      delivery.status === "ON_ROUTE" ||
      delivery.status === "DELIVERED" ||
      delivery.status === "PAID" ||
      delivery.status === "DISPUTE" ||
      delivery.status === "CLOSED");

  const showPickupNav = !!delivery && isChosenDriver && delivery.status === "ASSIGNED" && !!pickupNavUrl;

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
              <span className={`text-[11px] px-3 py-1.5 rounded-full border ${b.cls}`}>{b.text}</span>
            </div>
          )}
        </div>

        {/* alerts */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
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

              {/* ✅ ON_ROUTE: АВАХ хэсэг байхгүй. Buyer info + actions main card дээр. */}
              {delivery.status === "ON_ROUTE" ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-500">Худалдан авагч</div>

                      {privLoading ? (
                        <div className="text-xs text-slate-500 mt-2">Ачаалж байна…</div>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-slate-900 mt-1">
                            {buyerPhone ? `📞 ${buyerPhone}` : "📞 —"}
                          </div>

                          <div className="text-sm text-slate-800 mt-1 whitespace-pre-wrap break-words">
                            {buyerFullAddress || "Хаяг олдсонгүй."}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="shrink-0">
                      {buyerPhone ? (
                        <a
                          href={`tel:${buyerPhone}`}
                          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                        >
                          📞 Авах хүнрүү залгах
                        </a>
                      ) : (
                        <div className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-500">
                          📞 Утас олдсонгүй
                        </div>
                      )}
                    </div>

                  </div>

                  {/* ✅ Google Maps + Хүргэчихлээ — ижил өндөр */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {dropoffNavUrl ? (
                      <a
                        href={dropoffNavUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        🧭 Google Maps
                      </a>
                    ) : (
                      <div className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-500">
                        Google Maps холбоос алга
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => void markDelivered()}
                      disabled={!canMarkDelivered || markDeliveredLoading}
                      className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-3 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {markDeliveredLoading ? "Тэмдэглэж байна…" : "🎉 Хүргэчихлээ"}
                    </button>
                  </div>

                  <div className="text-[11px] text-slate-600">
                    * Мэдээлэл лавлах хэрэг гарвал доорх <span className="font-semibold">Худалдагч</span>-руу залгаж болно.
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] text-slate-500">АВАХ</div>
                    <div className="text-sm text-slate-900 mt-1">{pickupDisplay}</div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] text-slate-500">ХҮРГЭХ</div>
                    <div className="text-sm text-slate-900 mt-1">{dropoffDisplay}</div>
                  </div>
                </div>
              )}

              {delivery.note && (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-[11px] text-slate-500">Тайлбар</div>
                  <div className="text-sm text-slate-900 mt-1 whitespace-pre-wrap">{delivery.note}</div>
                </div>
              )}

              {(delivery.status === "DELIVERED" || delivery.status === "PAID" || delivery.status === "CLOSED") && (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-[11px] text-slate-500">Хүргэлт дууссан</div>
                  <div className="text-sm text-slate-900 mt-1">{fmtDT(delivery.closed_at)}</div>
                </div>
              )}

              {/* ✅ OPEN үед: ✋ Авъя / 🗑️ Хүсэлт цуцлах */}
              {delivery.status === "OPEN" && (
                <div className="space-y-2">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-slate-700">
                    <div className="mt-1">
                      Хэрэв та энэ хүргэлтийг хийхийг хүсвэл <span className="font-semibold">“✋ Авъя”</span> дээр дараарай.
                      Худалдагч таныг сонговол <span className="font-semibold">Ирж аваарай</span> дотор худалдагчийн
                      дэлгэрэнгүй хаяг, утас, Google Map Location зэрэг танд ил болно.
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!myBid ? (
                      <button
                        type="button"
                        onClick={() => void placeBid()}
                        disabled={bidLoading}
                        className="text-xs px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {bidLoading ? "Илгээж байна…" : "✋ Авъя"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void cancelBid()}
                        disabled={cancelBidLoading}
                        className="text-xs px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {cancelBidLoading ? "Цуцалж байна…" : "🗑️ Хүсэлт цуцлах"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* ✅ Худалдагч (сонгогдсон жолоочид) */}
            {showSellerCard && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-900">Худалдагч</h2>
                  {seller?.phone ? (
                    <a
                      href={`tel:${seller.phone}`}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Залгах
                    </a>
                  ) : null}
                </div>

                {sellerLoading ? (
                  <div className="text-xs text-slate-500">Ачаалж байна…</div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                    <div className="text-xs text-slate-700">
                      Нэр: <span className="font-semibold">{seller?.name || "—"}</span>
                    </div>
                    <div className="text-xs text-slate-700">
                      Утас: <span className="font-semibold">{seller?.phone || "—"}</span>
                    </div>
                  </div>
                )}

                {/* ✅ PICKUP үед Google Maps товч + анхааруулга */}
                {!hidePickupExtras && showPickupNav && (
                  <div className="space-y-2">
                    <a
                      href={pickupNavUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      📍 Худалдагчийн хаяг руу очих (Google Maps)
                    </a>
                    <div className="text-[11px] text-slate-600">
                      * Таны утсанд Google Maps апп суусан байх ёстой. (Суусан бол шууд навигац нээгдэнэ)
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ✅ ASSIGNED/PAID/DISPUTE/CLOSED үеийн үйлдлүүд (ON_ROUTE дээр байхгүй) */}
            {!hidePickupExtras && delivery.status !== "OPEN" && delivery.status !== "ON_ROUTE" && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">Үйлдэл</h2>

                <div className="flex flex-wrap items-center gap-2">
                  {delivery.status === "ASSIGNED" && (
                    <>
                      <div className="text-xs text-slate-600 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        Худалдагч “Барааг аваад явлаа” дарсны дараа “Замд” руу шилжинэ.
                      </div>

                      {isChosenDriver && (
                        <button
                          type="button"
                          onClick={() => void cancelBid()}
                          disabled={cancelBidLoading}
                          className="text-xs px-4 py-2 rounded-xl border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                        >
                          {cancelBidLoading ? "Татгалзаж байна…" : "Татгалзах"}
                        </button>
                      )}
                    </>
                  )}

                  {(delivery.status === "DELIVERED" || delivery.status === "PAID") && isChosenDriver && (
                    <>
                      {delivery.driver_confirmed_payment ? (
                        <div className="text-xs px-4 py-2 rounded-xl bg-slate-200 text-slate-600 font-semibold">
                          Төлбөр хүлээн авсан
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void confirmPaymentReceived()}
                          disabled={confirmPayLoading}
                          className="text-xs px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          {confirmPayLoading ? "Баталж байна…" : "Төлбөр хүлээн авсан"}
                        </button>
                      )}
                    </>
                  )}

                  {delivery.status === "DISPUTE" && (
                    <div className="text-xs text-slate-600 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      Маргаан нээгдсэн байна. (Admin шийдвэрлэнэ)
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* map preview (хамгийн доор) */}
            {hasMap && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">Газрын зураг</h2>

                <div className="w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <DeliveryRouteMap
                    pickup={{ lat: delivery.pickup_lat!, lng: delivery.pickup_lng! }}
                    dropoff={{ lat: delivery.dropoff_lat!, lng: delivery.dropoff_lng! }}
                    aspectRatio="16 / 9"
                    paddingPx={90}
                  />
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
