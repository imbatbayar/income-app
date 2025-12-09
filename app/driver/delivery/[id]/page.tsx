"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
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
  | "CLOSED" // бүрэн хаагдсан
  | "CANCELLED"
  | "DISPUTE"
  | "RETURNED";

type Delivery = {
  id: string;
  seller_id: string;
  from_address: string | null;
  to_address: string | null;
  receiver_phone: string | null;
  note: string | null;
  status: DeliveryStatus;
  created_at: string;
  price_mnt: number | null;
  delivery_type: string | null;
  chosen_driver_id: string | null;
};

type DeliveryRow = Delivery & {
  seller?:
    | {
        name: string | null;
        phone: string | null;
      }
    | null;
};

type BidRow = {
  driver_id: string;
  delivery_id: string;
};

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

function statusLabel(status: DeliveryStatus) {
  switch (status) {
    case "OPEN":
      return "Нээлттэй";
    case "ASSIGNED":
      return "Сонгогдсон";
    case "PICKED_UP":
      return "Замд";
    case "DELIVERED":
      return "Хүргэсэн";
    case "CLOSED":
      return "Хаагдсан";
    case "CANCELLED":
      return "Цуцалсан";
    case "DISPUTE":
      return "Маргаан";
    case "RETURNED":
      return "Буцаасан";
    default:
      return status;
  }
}

function mapsUrl(addr: string | null) {
  if (!addr) return null;
  const q = encodeURIComponent(addr);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export default function DriverDeliveryDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [user, setUser] = useState<IncomeUser | null>(null);
  const [delivery, setDelivery] = useState<DeliveryRow | null>(null);

  const [totalBids, setTotalBids] = useState(0);
  const [alreadyBid, setAlreadyBid] = useState(false);

  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingAll, setLoadingAll] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [markingDelivered, setMarkingDelivered] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // 1) Жолооч шалгах
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("incomeUser");
      if (!raw) {
        router.replace("/");
        return;
      }

      const parsed: IncomeUser = JSON.parse(raw);

      if (parsed.role !== "driver") {
        router.replace("/seller");
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

  // 2) Хүргэлт + саналын мэдээлэл
  useEffect(() => {
    if (!user) return;
    if (!params?.id) return;
    void fetchAll(user.id, params.id);
  }, [user, params?.id]);

  async function fetchAll(driverId: string, deliveryId: string) {
    try {
      setLoadingAll(true);
      setError(null);

      const { data, error } = await supabase
        .from("deliveries")
        .select(
          "id, seller_id, from_address, to_address, receiver_phone, note, status, created_at, price_mnt, delivery_type, chosen_driver_id, seller:seller_id(name, phone)"
        )
        .eq("id", deliveryId)
        .maybeSingle();

      if (error) {
        console.error(error);
        setError("Хүргэлтийн мэдээлэл татахад алдаа гарлаа.");
        setDelivery(null);
      } else if (!data) {
        setError("Ийм хүргэлт олдсонгүй.");
        setDelivery(null);
      } else {
        const raw: any = data;
        const sellerField = Array.isArray(raw.seller)
          ? raw.seller[0] || null
          : raw.seller ?? null;

        const normalized: DeliveryRow = {
          id: raw.id,
          seller_id: raw.seller_id,
          from_address: raw.from_address,
          to_address: raw.to_address,
          receiver_phone: raw.receiver_phone,
          note: raw.note,
          status: raw.status,
          created_at: raw.created_at,
          price_mnt: raw.price_mnt,
          delivery_type: raw.delivery_type,
          chosen_driver_id: raw.chosen_driver_id,
          seller: sellerField,
        };

        setDelivery(normalized);
      }

      const { data: bids, error: bErr } = await supabase
        .from("driver_bids")
        .select("delivery_id, driver_id")
        .eq("delivery_id", deliveryId);

      if (bErr) {
        console.error(bErr);
        setError("Жолоочийн саналын мэдээлэл татахад алдаа гарлаа.");
        setAlreadyBid(false);
        setTotalBids(0);
      } else {
        const list = (bids || []) as BidRow[];
        setTotalBids(list.length);
        setAlreadyBid(list.some((r) => r.driver_id === driverId));
      }
    } finally {
      setLoadingAll(false);
    }
  }

  // 3) Авах хүсэлт гаргах
  async function handleRequestDelivery() {
    if (!user || !delivery) return;

    if (delivery.status !== "OPEN") {
      setMessage("Энэ хүргэлт нээлттэй биш байна.");
      return;
    }

    if (alreadyBid) {
      setMessage("Та аль хэдийн авах хүсэлт гаргасан байна.");
      return;
    }

    try {
      setRequesting(true);
      setError(null);
      setMessage(null);

      const { error } = await supabase.from("driver_bids").insert({
        delivery_id: delivery.id,
        driver_id: user.id,
      });

      if (error) {
        console.error(error);
        setError("Авах хүсэлт илгээхэд алдаа гарлаа.");
        return;
      }

      setMessage("Авах хүсэлтийг амжилттай илгээлээ.");
      setAlreadyBid(true);
      setTotalBids((n) => n + 1);
    } finally {
      setRequesting(false);
    }
  }

  // 4) Жолооч барааг өгсөн (PICKED_UP → DELIVERED)
  async function handleMarkDelivered() {
    if (!user || !delivery) return;

    if (
      delivery.status !== "PICKED_UP" ||
      delivery.chosen_driver_id !== user.id
    ) {
      setMessage("Энэ хүргэлтийг та одоогоор хүргэж дуусгаагүй байна.");
      return;
    }

    try {
      setMarkingDelivered(true);
      setError(null);
      setMessage(null);

      const { error } = await supabase
        .from("deliveries")
        .update({ status: "DELIVERED" })
        .eq("id", delivery.id);

      if (error) {
        console.error(error);
        setError("Барааг өгсөн гэж тэмдэглэхэд алдаа гарлаа.");
        return;
      }

      setMessage(
        "Барааг өгсөн гэж тэмдэглэлээ. Худалдагч худалдан авагчтай ярьж баталгаажуулан хүргэлтийг хаана."
      );
      setDelivery({
        ...delivery,
        status: "DELIVERED",
      });
    } finally {
      setMarkingDelivered(false);
    }
  }

  function handleBack() {
    router.push("/driver");
  }

  if (loadingUser || loadingAll) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Ачаалж байна…</div>
      </div>
    );
  }

  if (!user || !delivery) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Мэдээлэл олдсонгүй.</div>
      </div>
    );
  }

  const { icon, label } = typeLabel(delivery.delivery_type);
  const created = new Date(delivery.created_at).toLocaleString("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const isMine = delivery.chosen_driver_id === user.id;
  const fromMaps = mapsUrl(delivery.from_address);
  const toMaps = mapsUrl(delivery.to_address);

  const isOpen = delivery.status === "OPEN";
  const isAssigned = delivery.status === "ASSIGNED";
  const isPickedUp = delivery.status === "PICKED_UP";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              ← Буцах
            </button>
            <div>
              <div className="text-sm font-semibold text-slate-900 flex items-center gap-1">
                <span>{icon}</span>
                <span>Хүргэлтийн дэлгэрэнгүй</span>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                <span>{label}</span>
                {delivery.price_mnt != null && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span className="font-medium text-slate-900">
                      {delivery.price_mnt.toLocaleString("mn-MN")}₮
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="text-right space-y-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px]">
              Статус: {statusLabel(delivery.status)}
            </span>
            <div className="text-[11px] text-slate-500">
              Үүссэн: {created}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-3 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
            {message}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1.7fr,1.3fr]">
          {/* LEFT column – хаяг, бараа, мэдээллийн түвшин */}
          <div className="space-y-4">
            <section className="rounded-2xl bg-white border border-slate-100 px-4 py-4 shadow-sm">
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
                    АВАХ ХАЯГ
                  </div>
                  <div className="text-[12px] text-slate-800 leading-snug">
                    {delivery.from_address || "Хаяг тодорхойгүй"}
                  </div>
                  {fromMaps && (
                    <a
                      href={fromMaps}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center text-[11px] text-sky-700 underline mt-1"
                    >
                      Google Maps дээр харах
                    </a>
                  )}
                </div>

                <div className="h-px bg-slate-100" />

                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
                    ХҮРГЭХ ХАЯГ
                  </div>
                  <div className="text-[12px] text-slate-800 leading-snug">
                    {delivery.to_address || "Хаяг тодорхойгүй"}
                  </div>
                  {toMaps && (
                    <a
                      href={toMaps}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center text-[11px] text-sky-700 underline mt-1"
                    >
                      Google Maps дээр харах
                    </a>
                  )}
                </div>

                <div className="h-px bg-slate-100" />

                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
                    ЮУ ХҮРГЭХ
                  </div>
                  <div className="text-[12px] text-slate-800 leading-snug">
                    {delivery.note || "Тайлбар оруулаагүй."}
                  </div>
                </div>

                <div className="h-px bg-slate-100" />

                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-slate-700">
                    Мэдээллийн түвшин
                  </div>
                  {isOpen && (
                    <p className="text-[11px] text-slate-500 leading-snug">
                      Одоогоор зөвхөн хаягийн ерөнхий мэдээлэл, Maps линк
                      харагдаж байна. Авах хүсэлт гаргаж, худалдагч таныг
                      сонгосны дараа худалдагчийн утас ил гарна.
                    </p>
                  )}
                  {isAssigned && isMine && (
                    <p className="text-[11px] text-slate-500 leading-snug">
                      Энэ хүргэлт{" "}
                      <span className="font-semibold text-slate-700">
                        танд оноосон
                      </span>
                      . Худалдагчийн утас харагдах тул бараа авах цаг, газрыг
                      утсаар тохирно.
                    </p>
                  )}
                  {isPickedUp && isMine && (
                    <p className="text-[11px] text-slate-500 leading-snug">
                      Та барааг худалдагчаас авч, худалдан авагч руу хүргэж
                      байна. Худалдан авагчийн утас, хүргэх хаяг бүрэн
                      харагдаж байгаа. Хүргээд дуусмагц{" "}
                      <span className="font-semibold text-slate-700">
                        “Барааг өгсөн”
                      </span>{" "}
                      товчийг дарна.
                    </p>
                  )}
                  {delivery.status === "DELIVERED" && isMine && (
                    <p className="text-[11px] text-slate-500 leading-snug">
                      Та барааг өгсөн гэж тэмдэглэсэн. Худалдагч баталгаажуулж
                      хаах хүртэл энэ хүргэлт архив байдлаар харагдана.
                    </p>
                  )}
                  {delivery.status === "CLOSED" && isMine && (
                    <p className="text-[11px] text-slate-500 leading-snug">
                      Энэ хүргэлт{" "}
                      <span className="font-semibold text-slate-700">
                        бүрэн хаагдсан
                      </span>
                      . Статус зөвхөн мэдээллийн зорилгоор харагдаж байна.
                    </p>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT column – худалдагч / худалдан авагчийн info + action-ууд */}
          <div className="space-y-4">
            {/* Сонгогдсон үед – худалдагчийн утас */}
            {isAssigned && isMine && (
              <section className="rounded-2xl bg-white border border-sky-100 px-4 py-3 shadow-sm">
                <div className="text-xs font-semibold text-slate-900 mb-1">
                  Худалдагчийн мэдээлэл
                </div>
                <div className="space-y-1 text-[12px]">
                  <div>Нэр: {delivery.seller?.name || "Нэр тодорхойгүй"}</div>
                  <div>
                    Утас:{" "}
                    {delivery.seller?.phone ? (
                      <a
                        href={`tel:${delivery.seller.phone}`}
                        className="text-sky-700 underline"
                      >
                        {delivery.seller.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 pt-2">
                  Бараа авах цаг, газар, орц зэргийг утсаар дэлгэрэнгүй
                  тохиролцоно.
                </p>
              </section>
            )}

            {/* Замд үед – худалдан авагчийн утас */}
            {isPickedUp && isMine && (
              <section className="rounded-2xl bg-white border border-emerald-100 px-4 py-3 shadow-sm">
                <div className="text-xs font-semibold text-slate-900 mb-1">
                  Худалдан авагчийн мэдээлэл
                </div>
                <div className="space-y-1 text-[12px]">
                  <div>
                    Утас:{" "}
                    {delivery.receiver_phone ? (
                      <a
                        href={`tel:${delivery.receiver_phone}`}
                        className="text-sky-700 underline"
                      >
                        {delivery.receiver_phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 pt-2">
                  Хаяг дээр очоод худалдан авагчтай холбогдож барааг гар дээр
                  нь өгөөд, доорх{" "}
                  <span className="font-semibold text-slate-700">
                    “Барааг өгсөн”
                  </span>{" "}
                  товчийг дарна.
                </p>

                <div className="flex items-center justify-end pt-2">
                  <button
                    onClick={handleMarkDelivered}
                    disabled={markingDelivered}
                    className="text-[11px] px-4 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {markingDelivered ? "Тэмдэглэж байна…" : "Барааг өгсөн"}
                  </button>
                </div>
              </section>
            )}

            {/* Нээлттэй үед – авах хүсэлт */}
            {isOpen && (
              <section className="rounded-2xl bg-white border border-emerald-100 px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      Энэ хүргэлтийг авах хүсэлт гаргах
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Нийт {totalBids} жолооч авах хүсэлт гаргаад байна.
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 mb-3">
                  Хаяг, зай, ачааны төрлийг өөрийн боломж, машины багтаамжтай
                  харьцуулж үнэлээд, тохиромжтой гэж үзвэл{" "}
                  <span className="font-semibold text-slate-700">
                    “Авах хүсэлт гаргах”
                  </span>{" "}
                  товчийг дарна.
                </p>

                <div className="flex items-center justify-end">
                  <button
                    onClick={handleRequestDelivery}
                    disabled={requesting || alreadyBid}
                    className="text-[11px] px-4 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {alreadyBid
                      ? "Авах хүсэлт илгээсэн"
                      : requesting
                      ? "Илгээж байна…"
                      : "Авах хүсэлт гаргах"}
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
