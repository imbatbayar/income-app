"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DeliveryRouteMap from "@/app/components/Map/DeliveryRouteMap";
import { DeliveryStatus, getSellerTabForStatus } from "@/lib/deliveryLogic";

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

  // full address (kept for share/edit, but NOT shown in top line now)
  from_address: string | null;
  to_address: string | null;
  note: string | null;

  // ✅ district/khoroo (used for top line)
  pickup_district: string | null;
  pickup_khoroo: string | null;
  dropoff_district: string | null;
  dropoff_khoroo: string | null;

  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;

  status: DeliveryStatus;
  created_at: string;
  price_mnt: number | null;
  delivery_type: string | null;

  chosen_driver_id: string | null;

  pickup_contact_phone?: string | null;
  dropoff_contact_phone?: string | null;
};

type DriverPublic = {
  id: string;
  name: string | null;
  phone: string | null;
  avatar_url?: string | null;
};

type BidRow = {
  id: string;
  driver_id: string;
  created_at: string;
  driver: DriverPublic | null;
};

function fmtPrice(n: number | null | undefined) {
  const v = Number(n || 0);
  return v ? `${v.toLocaleString("mn-MN")}₮` : "Үнэ тохиролцоно";
}

function fmtDT(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("mn-MN", { hour12: false });
  } catch {
    return iso || "";
  }
}

function shorten(s: string | null, max = 90) {
  if (!s) return "—";
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+$/, "") + "…";
}

function areaLine(district?: string | null, khoroo?: string | null) {
  const d = (district || "").trim();
  const k = (khoroo || "").trim();
  if (d && k) return `${d} · ${k}`;
  if (d) return d;
  if (k) return k;
  return "—";
}

function badge(status: DeliveryStatus) {
  switch (status) {
    case "OPEN":
      return {
        text: "Нээлттэй",
        cls: "bg-emerald-50 text-emerald-700 border-emerald-100",
      };
    case "ASSIGNED":
      return {
        text: "Жолооч сонгосон",
        cls: "bg-sky-50 text-sky-700 border-sky-100",
      };
    case "ON_ROUTE":
      return {
        text: "Замд",
        cls: "bg-indigo-50 text-indigo-700 border-indigo-100",
      };
    case "DELIVERED":
      return {
        text: "Хүргэсэн",
        cls: "bg-amber-50 text-amber-700 border-amber-100",
      };
    case "CANCELLED":
      return {
        text: "Цуцалсан",
        cls: "bg-rose-50 text-rose-700 border-rose-100",
      };
    default:
      return { text: status, cls: "bg-slate-50 text-slate-700 border-slate-200" };
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function SellerDeliveryDetailPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const { id } = useParams<{ id: string }>();

  const backTab = sp.get("tab") || "";

  const [user, setUser] = useState<IncomeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingBids, setLoadingBids] = useState(true);

  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);
  const [bids, setBids] = useState<BidRow[]>([]);
  const [chosenDriver, setChosenDriver] = useState<DriverPublic | null>(null);

  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [chooseLoading, setChooseLoading] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editFrom, setEditFrom] = useState("");
  const [editTo, setEditTo] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editPrice, setEditPrice] = useState<string>("");

  useEffect(() => {
    if (!msg && !error) return;
    const t = setTimeout(() => {
      setMsg(null);
      setError(null);
    }, 8000);
    return () => clearTimeout(t);
  }, [msg, error]);

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

  useEffect(() => {
    if (!user || !id) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, id]);

  async function loadAll() {
    if (!user) return;
    setLoading(true);
    setLoadingBids(true);
    setError(null);

    try {
      const { data, error: e1 } = await supabase
        .from("deliveries")
        .select(
          `
          id,
          seller_id,
          from_address,
          to_address,
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
          pickup_contact_phone,
          dropoff_contact_phone
        `
        )
        .eq("id", id)
        .maybeSingle();

      if (e1) throw e1;
      if (!data) {
        setDelivery(null);
        setError("Хүргэлт олдсонгүй.");
        setLoading(false);
        setLoadingBids(false);
        return;
      }

      if ((data as any).seller_id !== user.id) {
        setDelivery(null);
        setError("Энэ хүргэлтийг харах эрхгүй байна.");
        setLoading(false);
        setLoadingBids(false);
        return;
      }

      const d: DeliveryDetail = {
        id: (data as any).id,
        seller_id: (data as any).seller_id,

        from_address: (data as any).from_address ?? null,
        to_address: (data as any).to_address ?? null,
        note: (data as any).note ?? null,

        pickup_district: (data as any).pickup_district ?? null,
        pickup_khoroo: (data as any).pickup_khoroo ?? null,
        dropoff_district: (data as any).dropoff_district ?? null,
        dropoff_khoroo: (data as any).dropoff_khoroo ?? null,

        pickup_lat: (data as any).pickup_lat ?? null,
        pickup_lng: (data as any).pickup_lng ?? null,
        dropoff_lat: (data as any).dropoff_lat ?? null,
        dropoff_lng: (data as any).dropoff_lng ?? null,

        status: (data as any).status as DeliveryStatus,
        created_at: (data as any).created_at,
        price_mnt: (data as any).price_mnt ?? null,
        delivery_type: (data as any).delivery_type ?? null,
        chosen_driver_id: (data as any).chosen_driver_id ?? null,

        pickup_contact_phone: (data as any).pickup_contact_phone ?? null,
        dropoff_contact_phone: (data as any).dropoff_contact_phone ?? null,
      };

      setDelivery(d);

      // Edit uses full address (kept)
      setEditFrom(d.from_address || "");
      setEditTo(d.to_address || "");
      setEditNote(d.note || "");
      setEditPrice(d.price_mnt != null ? String(d.price_mnt) : "");

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
            phone,
            avatar_url
          )
        `
        )
        .eq("delivery_id", id)
        .order("created_at", { ascending: false });

      if (e2) setBids([]);
      else setBids((bidRows as any) || []);

      if (d.chosen_driver_id) {
        const { data: du } = await supabase
          .from("users")
          .select("id,name,phone,avatar_url")
          .eq("id", d.chosen_driver_id)
          .maybeSingle();

        setChosenDriver((du as any) || null);
      } else {
        setChosenDriver(null);
      }
    } catch (e: any) {
      console.error(e);
      setError("Мэдээлэл ачааллахад алдаа гарлаа.");
      setDelivery(null);
      setBids([]);
      setChosenDriver(null);
    } finally {
      setLoading(false);
      setLoadingBids(false);
    }
  }

  function goBack() {
    if (backTab) return router.push(`/seller?tab=${encodeURIComponent(backTab)}`);
    if (!delivery) return router.push("/seller?tab=OPEN");
    return router.push(`/seller?tab=${getSellerTabForStatus(delivery.status)}`);
  }

  const canEditOrCancel = useMemo(() => delivery?.status === "OPEN", [delivery]);
  const canChooseDriver = useMemo(
    () => !!delivery && delivery.status === "OPEN" && !delivery.chosen_driver_id,
    [delivery]
  );

  const pickup = useMemo(() => {
    if (!delivery) return null;
    if (delivery.pickup_lat == null || delivery.pickup_lng == null) return null;
    return { lat: Number(delivery.pickup_lat), lng: Number(delivery.pickup_lng) };
  }, [delivery]);

  const dropoff = useMemo(() => {
    if (!delivery) return null;
    if (delivery.dropoff_lat == null || delivery.dropoff_lng == null) return null;
    return { lat: Number(delivery.dropoff_lat), lng: Number(delivery.dropoff_lng) };
  }, [delivery]);

  async function chooseDriver(driverId: string) {
    if (!delivery || !user) return;
    if (!canChooseDriver) return;
    if (chooseLoading) return;

    setChooseLoading(driverId);
    setError(null);
    setMsg(null);

    try {
      const { data, error: e1 } = await supabase
        .from("deliveries")
        .update({ chosen_driver_id: driverId, status: "ASSIGNED" })
        .eq("id", delivery.id)
        .eq("seller_id", user.id)
        .eq("status", "OPEN")
        .is("chosen_driver_id", null)
        .select("id,status,chosen_driver_id")
        .maybeSingle();

      if (e1) throw e1;
      if (!data || (data as any).status !== "ASSIGNED") {
        setError("Сонголт амжилтгүй. Дахин оролдоно уу.");
        return;
      }

      setDelivery({
        ...delivery,
        status: "ASSIGNED",
        chosen_driver_id: (data as any).chosen_driver_id,
      });

      const target = bids.find((b) => b.driver_id === driverId)?.driver || null;
      setChosenDriver(target);

      setMsg("Жолооч сонгогдлоо.");
      setTimeout(() => router.push("/seller?tab=ASSIGNED"), 350);
    } catch (e: any) {
      console.error(e);
      setError("Жолооч сонгоход алдаа гарлаа.");
    } finally {
      setChooseLoading(null);
    }
  }

  async function cancelDelivery() {
    if (!delivery || !user) return;
    if (!canEditOrCancel) return;
    if (cancelLoading) return;

    setCancelLoading(true);
    setError(null);
    setMsg(null);

    try {
      const { data, error: e1 } = await supabase
        .from("deliveries")
        .update({ status: "CANCELLED" })
        .eq("id", delivery.id)
        .eq("seller_id", user.id)
        .eq("status", "OPEN")
        .select("id,status")
        .maybeSingle();

      if (e1) throw e1;
      if (!data || (data as any).status !== "CANCELLED") {
        setError("Цуцлах амжилтгүй. Дахин оролдоно уу.");
        return;
      }

      setDelivery({ ...delivery, status: "CANCELLED" });
      setMsg("Хүргэлтийг цуцаллаа.");
      setTimeout(() => router.push("/seller?tab=OPEN"), 450);
    } catch (e: any) {
      console.error(e);
      setError("Цуцлахад алдаа гарлаа.");
    } finally {
      setCancelLoading(false);
    }
  }

  async function saveEdit() {
    if (!delivery || !user) return;
    if (!canEditOrCancel) return;
    if (editSaving) return;

    const from = editFrom.trim();
    const to = editTo.trim();
    const note = editNote.trim();
    const priceNum = editPrice.trim() ? Number(editPrice.trim()) : null;

    if (editPrice.trim() && (!Number.isFinite(priceNum as any) || Number(priceNum) < 0)) {
      setError("Үнэ буруу байна.");
      return;
    }
    if (!from || !to) {
      setError("Авах/Хүргэх хаягаа бөглөнө үү.");
      return;
    }

    setEditSaving(true);
    setError(null);
    setMsg(null);

    try {
      const { data, error: e1 } = await supabase
        .from("deliveries")
        .update({
          from_address: from,
          to_address: to,
          note: note || null,
          price_mnt: priceNum,
        })
        .eq("id", delivery.id)
        .eq("seller_id", user.id)
        .eq("status", "OPEN")
        .select("id,from_address,to_address,note,price_mnt")
        .maybeSingle();

      if (e1) throw e1;

      if (data) {
        setDelivery({
          ...delivery,
          from_address: (data as any).from_address ?? from,
          to_address: (data as any).to_address ?? to,
          note: (data as any).note ?? null,
          price_mnt: (data as any).price_mnt ?? priceNum,
        });
      }

      setEditOpen(false);
      setMsg("Шинэчлэгдлээ.");
    } catch (e: any) {
      console.error(e);
      setError("Шинэчлэхэд алдаа гарлаа.");
    } finally {
      setEditSaving(false);
    }
  }

  function buildShareText(d: DeliveryDetail) {
    const from = d.from_address || "—";
    const to = d.to_address || "—";
    const price = fmtPrice(d.price_mnt);
    const what = d.note ? d.note.trim() : "";
    return (
      `🚚 Хүргэлт хэрэгтэй байна\n` +
      `📍 ${from} → ${to}\n` +
      `💰 ${price}\n` +
      (what ? `📦 ${what}\n` : "") +
      `#INCOME`
    );
  }

  async function shareFacebookOnly() {
    if (!delivery) return;

    const text = buildShareText(delivery);

    const ok = await copyText(text);
    if (ok) setMsg("📤 Пост текст хууллаа. Facebook дээр paste хийгээрэй.");
    else setError("Clipboard зөвшөөрөлгүй байна. (Хуулах боломжгүй)");

    try {
      const u = encodeURIComponent("https://income.mn");
      const quote = encodeURIComponent(text);
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${quote}`, "_blank");
    } catch {}
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          <div className="h-10 w-28 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          <div className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const b = delivery ? badge(delivery.status) : null;

  // ✅ top route uses district/khoroo ONLY
  const topFrom = delivery ? areaLine(delivery.pickup_district, delivery.pickup_khoroo) : "—";
  const topTo = delivery ? areaLine(delivery.dropoff_district, delivery.dropoff_khoroo) : "—";

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={goBack}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:border-slate-300"
          >
            ← Буцах
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        {msg && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {msg}
          </div>
        )}

        {!delivery ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Хүргэлт олдсонгүй.
          </div>
        ) : (
          <>
            {/* TOP CARD */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* ✅ Price badge: same size as status badge, placed before it */}
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-extrabold tracking-tight text-emerald-700">
                      {fmtPrice(delivery.price_mnt)}
                    </span>

                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                        b?.cls || ""
                      }`}
                    >
                      {b?.text || delivery.status}
                    </span>

                    <span className="text-xs text-slate-500">{fmtDT(delivery.created_at)}</span>
                  </div>

                  {/* ✅ Only district/khoroo route */}
                  <div className="mt-2 text-sm font-semibold leading-snug text-slate-900">
                    {topFrom} <span className="mx-1 text-slate-400">→</span> {topTo}
                  </div>

                  {/* NOTE as a clean pill */}
                  {delivery.note && (
                    <div className="mt-3">
                      <div className="inline-flex w-full items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
                        <span className="text-emerald-700">📦</span>
                        <span className="min-w-0 truncate">{shorten(delivery.note, 140)}</span>
                      </div>
                    </div>
                  )}

                  {/* INFO / WARNING */}
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-xs leading-relaxed text-slate-700">
                      <span className="font-semibold">ℹ️ Анхаар:</span>{" "}
                      Одоогоор энэ хэсэгт <span className="font-semibold">дүүрэг/хороо</span> л
                      харагдана.
                      <br />
                      Жолооч <span className="font-semibold">сонгогдвол</span> таны (худалдагчийн){" "}
                      <span className="font-semibold">хаяг, утас</span> жолоочид ил болно.
                      <br />
                      Жолооч <span className="font-semibold">барааг аваад “Замд”</span> орсон үед{" "}
                      <span className="font-semibold">хүлээн авагчийн</span> (хүргэх){" "}
                      <span className="font-semibold">дэлгэрэнгүй хаяг, утас</span> мөн ил болно.
                    </div>
                  </div>
                </div>
              </div>

              {/* ACTIONS — below (no overlap) */}
              {canEditOrCancel && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => setEditOpen((v) => !v)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-slate-300"
                  >
                    {editOpen ? "Засах хаах" : "Засах"}
                  </button>

                  <button
                    onClick={() => void shareFacebookOnly()}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    title="Copy + Facebook open"
                  >
                    📤 Facebook-д шэр
                  </button>

                  <button
                    onClick={() => void cancelDelivery()}
                    disabled={cancelLoading}
                    className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                  >
                    {cancelLoading ? "Цуцалж байна…" : "Цуцлах"}
                  </button>
                </div>
              )}

              {/* EDIT PANEL */}
              {canEditOrCancel && editOpen && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Авах хаяг</label>
                      <input
                        value={editFrom}
                        onChange={(e) => setEditFrom(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700">Хүргэх хаяг</label>
                      <input
                        value={editTo}
                        onChange={(e) => setEditTo(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700">Тайлбар</label>
                      <textarea
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        className="mt-1 w-full min-h-[80px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700">Үнэ (₮)</label>
                      <input
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value.replace(/[^\d]/g, ""))}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                        inputMode="numeric"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => void saveEdit()}
                        disabled={editSaving}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        {editSaving ? "Хадгалж байна…" : "Хадгалах"}
                      </button>

                      <button
                        onClick={() => setEditOpen(false)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-slate-300"
                      >
                        Болих
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* MAP */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">Газрын зураг</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Авах (цэнхэр) · Хүргэх (ногоон)
                </div>
              </div>
              <DeliveryRouteMap pickup={pickup} dropoff={dropoff} height={240} />
            </div>

            {/* CHOSEN DRIVER */}
            {delivery.chosen_driver_id && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">Сонгосон жолооч</div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-100">
                    {chosenDriver?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={chosenDriver.avatar_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                        —
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">
                      {chosenDriver?.name || "Жолооч"}
                    </div>
                    <div className="text-xs text-slate-600">{chosenDriver?.phone || "—"}</div>
                  </div>

                  <div className="ml-auto flex flex-wrap gap-2">
                    {chosenDriver?.phone && (
                      <a
                        href={`tel:${chosenDriver.phone}`}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        Залгах
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* BIDS (OPEN only) */}
            {delivery.status === "OPEN" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">Жолоочийн хүсэлтүүд</div>
                  <div className="text-xs text-slate-500">
                    {loadingBids ? "Ачаалж байна…" : `${bids.length} хүсэлт`}
                  </div>
                </div>

                {loadingBids ? (
                  <div className="mt-3 text-sm text-slate-600">Ачаалж байна…</div>
                ) : bids.length === 0 ? (
                  <div className="mt-3 text-sm text-slate-600">
                    Одоогоор хүсэлт ирээгүй байна.
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {bids.map((bid) => (
                      <div key={bid.id} className="rounded-2xl border border-slate-200 p-3">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900">
                              {bid.driver?.name || "Жолооч"}
                            </div>
                            <div className="text-xs text-slate-600">{bid.driver?.phone || "—"}</div>
                          </div>

                          <div className="ml-auto flex items-center gap-2">
                            {bid.driver?.phone && (
                              <a
                                href={`tel:${bid.driver.phone}`}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:border-slate-300"
                              >
                                Залгах
                              </a>
                            )}

                            <button
                              onClick={() => void chooseDriver(bid.driver_id)}
                              disabled={!!chooseLoading}
                              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {chooseLoading === bid.driver_id ? "Сонгож байна…" : "Сонгох"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
