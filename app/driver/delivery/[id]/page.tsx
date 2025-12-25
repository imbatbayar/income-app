"use client";

/* ===========================
 * app/driver/delivery/[id]/page.tsx (Driver Open Detail — PRIVACY + MAP FIX)
 *
 * ✅ FIX 1: OFFERS(OPEN) үед нарийн хаяг (from_address/to_address) харагдахгүй
 *          → зөвхөн дүүрэг/хороо (pickup_district/khoroo, dropoff_district/khoroo)
 *
 * ✅ FIX 2: PICKUP(ASSIGNED + chosen) үед зөвхөн АВАХ нарийн хаяг тодорно + Google Maps товч
 * ✅ FIX 3: Map “хагас” харагддаг асуудлыг aspectRatio="16 / 9" болгож seller-style болгосон
 *
 * ⚠️ NOTE: Нарийн хаягийг UI дээр нуухаас гадна OPEN үед DB-ээс ч авчрахгүй (privacy-г бодож).
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

  // ✅ public area fields
  pickup_district: string | null;
  pickup_khoroo: string | null;
  dropoff_district: string | null;
  dropoff_khoroo: string | null;

  // ✅ sensitive (load conditionally)
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

  // legacy/support
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

export default function DriverDeliveryDetailPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const { id } = useParams<{ id: string }>();

  const backTab = sp.get("tab") || "";

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

  // dispute UI (legacy stays)
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeLoading, setDisputeLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);

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
      const { data, error } = await supabase.from("users").select("id,name,phone").eq("id", sellerId).maybeSingle();
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
      // ✅ 1) Base (public-ish) fields
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

        // ✅ Sensitive: default null (OPEN үед бүр авчрахгүй)
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

      // ✅ seller info load (UI дээр chosen үед л харуулна)
      void fetchSeller(dBase.seller_id);

      // ✅ my bid (limit(1) — duplicate байж болох тул safe)
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

      // ✅ 2) Load sensitive addresses only when it’s YOUR assigned (privacy)
      const isMine = !!dBase.chosen_driver_id && dBase.chosen_driver_id === user.id;

      // pickup detail appears from ASSIGNED onward (mine only)
      const allowPickupDetail =
        isMine &&
        (dBase.status === "ASSIGNED" ||
          dBase.status === "ON_ROUTE" ||
          dBase.status === "DELIVERED" ||
          dBase.status === "PAID" ||
          dBase.status === "DISPUTE" ||
          dBase.status === "CLOSED");

      // dropoff detail appears from ON_ROUTE onward (mine only)
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

      // ✅ private info load (mine + allowed statuses) — existing logic
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

  const canOpenDispute = useMemo(() => {
    if (!delivery) return false;
    if (delivery.status === "DISPUTE" || delivery.status === "CLOSED" || delivery.status === "CANCELLED") return false;
    return delivery.status === "ON_ROUTE" || delivery.status === "DELIVERED" || delivery.status === "PAID";
  }, [delivery]);

  const hasMap =
    !!delivery &&
    delivery.pickup_lat != null &&
    delivery.pickup_lng != null &&
    delivery.dropoff_lat != null &&
    delivery.dropoff_lng != null;

  const privateAllowed = useMemo(() => {
    if (!delivery || !user) return false;
    if (!isChosenDriver) return false;
    return (
      delivery.status === "ON_ROUTE" ||
      delivery.status === "DELIVERED" ||
      delivery.status === "PAID" ||
      delivery.status === "DISPUTE" ||
      delivery.status === "CLOSED"
    );
  }, [delivery, user, isChosenDriver]);

  // ✅ Hook order fix: useMemo is above early returns
  const privateText = useMemo(() => {
    if (!priv) return "";
    const lines = [
      priv.buyer_phone ? `Утас: ${priv.buyer_phone}` : null,
      priv.to_detail ? `Нарийн хаяг: ${priv.to_detail}` : null,
    ].filter(Boolean) as string[];
    return lines.join("\n");
  }, [priv]);

  const pickupArea = useMemo(() => {
    if (!delivery) return "—";
    return areaLine(delivery.pickup_district, delivery.pickup_khoroo);
  }, [delivery]);

  const dropoffArea = useMemo(() => {
    if (!delivery) return "—";
    return areaLine(delivery.dropoff_district, delivery.dropoff_khoroo);
  }, [delivery]);

  const pickupDisplay = useMemo(() => {
    if (!delivery) return "—";

    // OPEN → public area only
    if (delivery.status === "OPEN") return pickupArea;

    // ASSIGNED (mine) → full pickup address; else public area
    if (delivery.status === "ASSIGNED") {
      return isChosenDriver ? delivery.from_address || pickupArea : pickupArea;
    }

    // ON_ROUTE+ (mine) → full pickup address; else public area
    if (
      delivery.status === "ON_ROUTE" ||
      delivery.status === "DELIVERED" ||
      delivery.status === "PAID" ||
      delivery.status === "DISPUTE" ||
      delivery.status === "CLOSED"
    ) {
      return isChosenDriver ? delivery.from_address || pickupArea : pickupArea;
    }

    return pickupArea;
  }, [delivery, pickupArea, isChosenDriver]);

  const dropoffDisplay = useMemo(() => {
    if (!delivery) return "—";

    // OPEN/ASSIGNED → public area only
    if (delivery.status === "OPEN" || delivery.status === "ASSIGNED") return dropoffArea;

    // ON_ROUTE+ (mine) → full dropoff address; else public area
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

  // ✅ fetch private only when allowed
  async function maybeLoadPrivate(d: DeliveryDetail) {
    if (!user) return;

    const isMine = !!d.chosen_driver_id && d.chosen_driver_id === user.id;
    const allowed =
      d.status === "ON_ROUTE" || d.status === "DELIVERED" || d.status === "PAID" || d.status === "DISPUTE" || d.status === "CLOSED";

    if (!isMine || !allowed) {
      setPriv(null);
      return;
    }

    setPrivLoading(true);
    try {
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
      const { data, error } = await supabase
        .from("driver_bids")
        .insert({ delivery_id: delivery.id, driver_id: user.id })
        .select("id, driver_id, delivery_id, created_at")
        .maybeSingle();

      if (error) {
        // unique conflict байвал зүгээр гэж үзээд fetchAll хийе
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

  // ✅ OPEN: cancel bid (delivery_id + driver_id)
  // ✅ ASSIGNED + chosen driver: decline => OPEN + chosen_driver_id=null
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
        // clean bids (just in case)
        await supabase.from("driver_bids").delete().eq("delivery_id", delivery.id).eq("driver_id", user.id);
        setMyBid(null);

        const { data, error } = await supabase
          .from("deliveries")
          .update({ status: "OPEN", chosen_driver_id: null })
          .eq("id", delivery.id)
          .eq("chosen_driver_id", user.id)
          .select("id,status,chosen_driver_id")
          .maybeSingle();

        if (error || !data) {
          console.error(error);
          setError(pickErr(error, "Татгалзахад алдаа гарлаа."));
          return;
        }

        setDelivery((d) => (d ? { ...d, status: "OPEN", chosen_driver_id: null, from_address: null, to_address: null } : d));
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

  // ✅ ON_ROUTE -> DELIVERED
  async function markDelivered() {
    if (!delivery || !user) return;
    if (!canMarkDelivered) return setError("Энэ хүргэлт танд оноогдоогүй эсвэл төлөв буруу байна.");
    if (markDeliveredLoading) return;

    setMarkDeliveredLoading(true);
    setError(null);
    setMsg(null);

    try {
      const { data, error } = await supabase
        .from("deliveries")
        .update({ status: "DELIVERED" })
        .eq("id", delivery.id)
        .eq("status", "ON_ROUTE")
        .eq("chosen_driver_id", user.id)
        .select("id,status,chosen_driver_id")
        .maybeSingle();

      if (error || !data) {
        console.error(error);
        setError(pickErr(error, "Хүргэсэн гэж тэмдэглэхэд алдаа гарлаа."));
        return;
      }

      const nd: DeliveryDetail = { ...delivery, status: "DELIVERED", chosen_driver_id: (data as any).chosen_driver_id };

      setDelivery(nd);
      void maybeLoadPrivate(nd);

      setMsg("Хүргэсэн гэж тэмдэглэлээ.");
      router.push(`/driver?tab=${getDriverTabForStatus("DELIVERED")}`);
      router.refresh();
    } finally {
      setMarkDeliveredLoading(false);
    }
  }

  // ---- legacy functions kept as-is (PAID/DISPUTE/CLOSED) ----
  async function confirmPaymentReceived() {
    if (!delivery || !user) return;
    if (confirmPayLoading) return;

    if (delivery.status !== "PAID") return setError("Зөвхөн 'Төлсөн' үед төлбөр хүлээн авснаа батална.");
    if (!isChosenDriver) return setError("Энэ хүргэлт танд оноогдоогүй байна.");
    if (delivery.driver_confirmed_payment) return setError("Төлбөр аль хэдийн баталгаажсан байна.");

    setConfirmPayLoading(true);
    setError(null);
    setMsg(null);

    try {
      const closedAt = new Date().toISOString();

      const { data, error } = await supabase
        .from("deliveries")
        .update({ driver_confirmed_payment: true, status: "CLOSED", closed_at: closedAt })
        .eq("id", delivery.id)
        .eq("chosen_driver_id", user.id)
        .eq("status", "PAID")
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
        status: "CLOSED",
        closed_at: (data as any).closed_at ?? closedAt,
        seller_marked_paid: !!(data as any).seller_marked_paid,
        chosen_driver_id: (data as any).chosen_driver_id ?? delivery.chosen_driver_id,
      };

      setDelivery(nd);
      void maybeLoadPrivate(nd);

      setMsg("Төлбөр хүлээн авснаа баталлаа.");
      router.push(`/driver?tab=${getDriverTabForStatus("CLOSED")}`);
      router.refresh();
    } finally {
      setConfirmPayLoading(false);
    }
  }

  async function openDispute() {
    if (!delivery) return;

    const reason = disputeReason.trim();
    if (!reason) return setError("Маргааны шалтгаанаа бичнэ үү.");
    if (!canOpenDispute) return setError("Энэ төлөв дээр маргаан нээх боломжгүй.");
    if (disputeLoading) return;

    setDisputeLoading(true);
    setError(null);
    setMsg(null);

    try {
      const openedAt = new Date().toISOString();

      const { data, error } = await supabase
        .from("deliveries")
        .update({ status: "DISPUTE", dispute_reason: reason, dispute_opened_at: openedAt })
        .eq("id", delivery.id)
        .in("status", ["ON_ROUTE", "DELIVERED", "PAID"] as any)
        .select("id,status,dispute_reason,dispute_opened_at,chosen_driver_id")
        .maybeSingle();

      if (error || !data) {
        console.error(error);
        setError(pickErr(error, "Маргаан нээхэд алдаа гарлаа."));
        return;
      }

      const nd: DeliveryDetail = {
        ...delivery,
        status: "DISPUTE",
        dispute_reason: (data as any).dispute_reason ?? reason,
        dispute_opened_at: (data as any).dispute_opened_at ?? openedAt,
        chosen_driver_id: (data as any).chosen_driver_id ?? delivery.chosen_driver_id,
      };

      setDelivery(nd);
      void maybeLoadPrivate(nd);

      setShowDispute(false);
      setDisputeReason("");
      setMsg("Маргаан нээгдлээ.");
      router.push(`/driver?tab=${getDriverTabForStatus("DISPUTE")}`);
      router.refresh();
    } finally {
      setDisputeLoading(false);
    }
  }

  async function resolveDispute() {
    if (!delivery) return;
    if (delivery.status !== "DISPUTE") return;
    if (resolveLoading) return;

    setResolveLoading(true);
    setError(null);
    setMsg(null);

    try {
      const closedAt = new Date().toISOString();

      const { data, error } = await supabase
        .from("deliveries")
        .update({ status: "CLOSED", closed_at: closedAt })
        .eq("id", delivery.id)
        .eq("status", "DISPUTE")
        .select("id,status,closed_at,chosen_driver_id")
        .maybeSingle();

      if (error || !data) {
        console.error(error);
        setError(pickErr(error, "Маргааныг шийдэгдсэн болгоход алдаа гарлаа."));
        return;
      }

      const nd: DeliveryDetail = {
        ...delivery,
        status: "CLOSED",
        closed_at: (data as any).closed_at ?? closedAt,
        chosen_driver_id: (data as any).chosen_driver_id ?? delivery.chosen_driver_id,
      };

      setDelivery(nd);
      void maybeLoadPrivate(nd);

      setMsg("Маргаан шийдэгдлээ. Хүргэлт хаагдлаа.");
      router.push(`/driver?tab=${getDriverTabForStatus("CLOSED")}`);
      router.refresh();
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
  const showDropoffNav = !!delivery && isChosenDriver && delivery.status === "ON_ROUTE" && !!dropoffNavUrl;

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

              {delivery.note && (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-[11px] text-slate-500">Тайлбар</div>
                  <div className="text-sm text-slate-900 mt-1 whitespace-pre-wrap">{delivery.note}</div>
                </div>
              )}

              {/* ✅ OPEN үед: тайлбар + (✋ Авъя / 🗑️ Хүсэлт цуцлах) нь ХҮРГЭЛТ КАРТ ДОТОР */}
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

            {/* ✅ Seller card (only when chosen driver) */}
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
                {showPickupNav && (
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

            {/* ✅ private info card (only allowed) */}
            {delivery.status !== "OPEN" && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900">Хүлээн авагч</h2>

                {privateAllowed && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyText(privateText);
                      setMsg(ok ? "Хууллаа." : "Хуулах боломжгүй байна.");
                    }}
                    disabled={privLoading || !priv}
                    className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Хуулах
                  </button>
                )}
              </div>

              {!privateAllowed ? (
                <div className="text-xs text-slate-600">
                  Нарийн хаяг/утас нь зөвхөн <span className="font-semibold">“Замд”</span> (эсвэл түүнээс хойш) үед, мөн
                  зөвхөн <span className="font-semibold">оноогдсон жолоочид</span> харагдана.
                </div>
              ) : privLoading ? (
                <div className="text-xs text-slate-500">Ачаалж байна…</div>
              ) : !priv ? (
                <div className="text-xs text-slate-500">Нарийн мэдээлэл олдсонгүй.</div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                  <div className="text-xs text-slate-700">{priv.buyer_phone ? `📞 ${priv.buyer_phone}` : "📞 —"}</div>
                  {priv.to_detail && <div className="text-xs text-slate-700 whitespace-pre-wrap">{priv.to_detail}</div>}
                </div>
              )}

              {/* ✅ IN_TRANSIT үед dropoff google maps */}
              {showDropoffNav && (
                <div className="space-y-2 pt-1">
                  <a
                    href={dropoffNavUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    🧭 Хүргэх хаяг руу очих (Google Maps)
                  </a>
                  <div className="text-[11px] text-slate-600">
                    * Таны утсанд Google Maps суусан байх ёстой.
                  </div>
                </div>
              )}
            </section>
            )}

            {/* map preview */}
            {hasMap && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">Газрын зураг</h2>

                {/* ✅ FIX: Seller-style aspect ratio (хагас болохгүй) */}
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

            {/* actions (OPEN дээр харуулахгүй — Avya товч main card дотор орсон) */}
            {delivery.status !== "OPEN" && (
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

                  {delivery.status === "ON_ROUTE" && (
                    <button
                      type="button"
                      onClick={() => void markDelivered()}
                      disabled={!canMarkDelivered || markDeliveredLoading}
                      className="text-xs px-4 py-2 rounded-xl bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {markDeliveredLoading ? "Тэмдэглэж байна…" : "🎉 Хүргэчихлээ"}
                    </button>
                  )}

                  {(delivery.status === "ON_ROUTE" || delivery.status === "DELIVERED" || delivery.status === "PAID") && (
                    <button
                      type="button"
                      onClick={() => setShowDispute(true)}
                      className="text-xs px-4 py-2 rounded-xl border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    >
                      Маргаан
                    </button>
                  )}

                  {delivery.status === "PAID" && isChosenDriver && !delivery.driver_confirmed_payment && (
                    <button
                      type="button"
                      onClick={() => void confirmPaymentReceived()}
                      disabled={confirmPayLoading}
                      className="text-xs px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {confirmPayLoading ? "Баталж байна…" : "Төлбөр хүлээн авсан"}
                    </button>
                  )}

                  {delivery.status === "DISPUTE" && (
                    <button
                      type="button"
                      onClick={() => void resolveDispute()}
                      disabled={resolveLoading}
                      className="text-xs px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {resolveLoading ? "Шийдэж байна…" : "Маргаан шийдэгдсэн"}
                    </button>
                  )}
                </div>
              </section>
            )}

            {/* dispute modal (legacy) */}
            {showDispute && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
                <div className="absolute inset-0 bg-black/40" onClick={() => setShowDispute(false)} />
                <div className="relative max-w-md w-full rounded-2xl bg-white shadow-lg border border-slate-200 px-4 py-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Маргаан үүсгэх (driver)</h3>
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
                      onClick={() => void openDispute()}
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
