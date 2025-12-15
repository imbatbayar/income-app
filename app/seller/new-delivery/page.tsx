"use client";

import "leaflet/dist/leaflet.css";

import dynamic from "next/dynamic";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
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

type LatLng = { lat: number; lng: number };

// ✅ undefined-ийг ч зөв хөрвүүлнэ
function numOrNull(v: number | null | undefined) {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  return v;
}

function isValidLatLng(p: LatLng | null) {
  if (!p) return false;
  return (
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    !Number.isNaN(p.lat) &&
    !Number.isNaN(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

async function geocodeOne(query: string): Promise<LatLng | null> {
  const q = String(query || "").trim();
  if (!q) return null;

  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&q=" +
    encodeURIComponent(q);

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;

  const data = (await res.json()) as any[];
  if (!data || !data.length) return null;

  const lat = Number(data[0].lat);
  const lng = Number(data[0].lon);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  return { lat, lng };
}

// ✅ divIcon marker (ногоон/улаан дугуй)
function circleIcon(color: "green" | "red") {
  const fill = color === "green" ? "#10b981" : "#ef4444";
  const stroke = color === "green" ? "#065f46" : "#7f1d1d";

  return L.divIcon({
    className: "",
    html: `<div style="
      width:16px;height:16px;border-radius:999px;
      background:${fill}; border:2px solid ${stroke};
      box-shadow:0 2px 10px rgba(0,0,0,.18);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

/**
 * ✅ LeafletMap — react-leaflet-ийг зөвхөн client дээр л ачаална
 * - pickup green marker
 * - dropoff red marker
 * - dashed polyline (round cap)
 * - fitBounds автоматаар
 *
 * react-leaflet v5: whenCreated байхгүй → ref ашиглана.
 */
const LeafletMap = dynamic(async () => {
  const RL = await import("react-leaflet");
  const { MapContainer, TileLayer, Marker, Polyline } = RL;

  type Props = {
    center: LatLng;
    pickup: LatLng | null;
    dropoff: LatLng | null;
    onPickupChange: (p: LatLng) => void;
    onDropoffChange: (p: LatLng) => void;
  };

  function Inner({ center, pickup, dropoff, onPickupChange, onDropoffChange }: Props) {
    const mapRef = useRef<L.Map | null>(null);

    const polyline = useMemo(() => {
      if (!isValidLatLng(pickup) || !isValidLatLng(dropoff)) return null;
      return [
        [pickup!.lat, pickup!.lng],
        [dropoff!.lat, dropoff!.lng],
      ] as [number, number][];
    }, [pickup, dropoff]);

    useEffect(() => {
      if (!mapRef.current) return;
      if (!isValidLatLng(pickup) || !isValidLatLng(dropoff)) return;

      const bounds = L.latLngBounds([pickup!.lat, pickup!.lng], [dropoff!.lat, dropoff!.lng]);
      mapRef.current.fitBounds(bounds.pad(0.25), { animate: true });
    }, [pickup, dropoff]);

    return (
      <MapContainer
        ref={(map) => {
          mapRef.current = (map as unknown as L.Map) || null;
        }}
        center={[center.lat, center.lng]}
        zoom={13}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {isValidLatLng(pickup) && (
          <Marker
            position={[pickup!.lat, pickup!.lng]}
            draggable
            icon={circleIcon("green")}
            eventHandlers={{
              dragend: (e: any) => {
                const ll = e.target.getLatLng();
                onPickupChange({ lat: ll.lat, lng: ll.lng });
              },
            }}
          />
        )}

        {isValidLatLng(dropoff) && (
          <Marker
            position={[dropoff!.lat, dropoff!.lng]}
            draggable
            icon={circleIcon("red")}
            eventHandlers={{
              dragend: (e: any) => {
                const ll = e.target.getLatLng();
                onDropoffChange({ lat: ll.lat, lng: ll.lng });
              },
            }}
          />
        )}

        {polyline && (
          <Polyline
            positions={polyline}
            pathOptions={{
              color: "#111827",
              weight: 6,
              opacity: 0.85,
              dashArray: "10 12",
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        )}
      </MapContainer>
    );
  }

  return Inner;
}, { ssr: false });

export default function NewDeliveryPage() {
  const router = useRouter();

  const [user, setUser] = useState<IncomeUser | null>(null);

  const [deliveryType, setDeliveryType] = useState("apartment");
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("");

  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [dropoff, setDropoff] = useState<LatLng | null>(null);

  const [geoLoadingFrom, setGeoLoadingFrom] = useState(false);
  const [geoLoadingTo, setGeoLoadingTo] = useState(false);

  const [loadingUser, setLoadingUser] = useState(true);
  const [sending, setSending] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const ubCenter: LatLng = useMemo(() => ({ lat: 47.9186, lng: 106.917 }), []);

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

      const savedFrom = window.localStorage.getItem("incomeLastFromAddress");
      if (savedFrom && savedFrom.trim().length > 0) {
        setFromAddress(savedFrom);
      }

      setLoadingUser(false);
    } catch (e) {
      console.error(e);
      setError("Хэрэглэгчийн мэдээлэл уншихад алдаа гарлаа.");
      setLoadingUser(false);
    }
  }, [router]);

  async function handleGeocodeFrom() {
    setError(null);
    const q = fromAddress.trim();
    if (!q) return setError("АВАХ хаяг хоосон байна.");

    try {
      setGeoLoadingFrom(true);
      const p = await geocodeOne(q);
      if (!p) return setError("АВАХ хаяг олдсонгүй. Илүү тодорхой бичээд дахин хайна уу.");
      setPickup(p);
    } catch (e) {
      console.error(e);
      setError("АВАХ хаяг хайхад алдаа гарлаа.");
    } finally {
      setGeoLoadingFrom(false);
    }
  }

  async function handleGeocodeTo() {
    setError(null);
    const q = toAddress.trim();
    if (!q) return setError("ХҮРГЭХ хаяг хоосон байна.");

    try {
      setGeoLoadingTo(true);
      const p = await geocodeOne(q);
      if (!p) return setError("ХҮРГЭХ хаяг олдсонгүй. Илүү тодорхой бичээд дахин хайна уу.");
      setDropoff(p);
    } catch (e) {
      console.error(e);
      setError("ХҮРГЭХ хаяг хайхад алдаа гарлаа.");
    } finally {
      setGeoLoadingTo(false);
    }
  }

  async function ensureCoordsBeforeSubmit() {
    if (!isValidLatLng(pickup)) {
      const p = await geocodeOne(fromAddress);
      if (p) setPickup(p);
    }
    if (!isValidLatLng(dropoff)) {
      const p = await geocodeOne(toAddress);
      if (p) setDropoff(p);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setError(null);
    setSuccess(false);

    if (!fromAddress.trim()) return setError("АВАХ хаяг хоосон байна.");
    if (!toAddress.trim()) return setError("ХҮРГЭХ хаяг хоосон байна.");
    if (!receiverPhone.trim()) return setError("ХҮЛЭЭН АВАХ хүний утас заавал.");
    if (!price.trim() || isNaN(Number(price))) return setError("Үнэ (₮) зөв оруулна уу.");

    try {
      setSending(true);

      await ensureCoordsBeforeSubmit();

      const hasPick = isValidLatLng(pickup);
      const hasDrop = isValidLatLng(dropoff);

      if (!hasPick || !hasDrop) {
        setSending(false);
        setError("Map дээр ногоон/улаан цэгийг байрлуулаад (эсвэл Хайх дарж) дахин илгээнэ үү.");
        return;
      }

      const { error: insertError } = await supabase.from("deliveries").insert({
        seller_id: user.id,
        delivery_type: deliveryType,
        from_address: fromAddress,
        to_address: toAddress,
        receiver_phone: receiverPhone,
        note,
        price_mnt: Number(price),
        status: "OPEN",

        pickup_lat: numOrNull(pickup?.lat),
        pickup_lng: numOrNull(pickup?.lng),
        dropoff_lat: numOrNull(dropoff?.lat),
        dropoff_lng: numOrNull(dropoff?.lng),
      });

      if (insertError) {
        console.error(insertError);
        setError("Хүргэлтийн мэдээлэл илгээхэд алдаа гарлаа.");
        setSending(false);
        return;
      }

      window.localStorage.setItem("incomeLastFromAddress", fromAddress);

      setSuccess(true);
      setTimeout(() => router.push("/seller"), 900);
    } catch (err) {
      console.error(err);
      setError("Сервертэй холбогдоход алдаа гарлаа.");
    } finally {
      setSending(false);
    }
  }

  const mapCenter = useMemo(() => {
    if (isValidLatLng(pickup)) return pickup!;
    if (isValidLatLng(dropoff)) return dropoff!;
    return ubCenter;
  }, [pickup, dropoff, ubCenter]);

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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center rounded-full bg-emerald-50 px-3 py-1">
              <span className="text-xs font-semibold text-emerald-700">INCOME</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-900">Хүргэлт үүсгэх</h1>
              <p className="text-xs text-slate-500">Хаягаа оруулаад map дээр цэгээ байрлуулаарай.</p>
            </div>
          </div>

          <button
            onClick={() => router.push("/seller")}
            className="mt-3 text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            ← Буцах
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {success && (
          <div className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
            Хүргэлт амжилттай үүсгэгдлээ!
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">Map</div>
            <div className="text-[11px] text-slate-500">🟢 эхлэх · 🔴 дуусах (чирж байрлуулж болно)</div>
          </div>

          <div className="h-[320px] w-full overflow-hidden rounded-2xl border border-slate-200">
            <LeafletMap
              center={mapCenter}
              pickup={pickup}
              dropoff={dropoff}
              onPickupChange={setPickup}
              onDropoffChange={setDropoff}
            />
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
              <div className="text-[11px] text-emerald-700/80">🟢 Эхлэх цэг</div>
              <div className="text-xs font-semibold text-emerald-900">
                {isValidLatLng(pickup) ? `${pickup!.lat.toFixed(5)}, ${pickup!.lng.toFixed(5)}` : "Тохируулаагүй"}
              </div>
            </div>

            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2">
              <div className="text-[11px] text-rose-700/80">🔴 Дуусах цэг</div>
              <div className="text-xs font-semibold text-rose-900">
                {isValidLatLng(dropoff) ? `${dropoff!.lat.toFixed(5)}, ${dropoff!.lng.toFixed(5)}` : "Тохируулаагүй"}
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">Хүргэлтийн төрөл</label>
            <select
              value={deliveryType}
              onChange={(e) => setDeliveryType(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
            >
              <option value="apartment">🏙 Байр</option>
              <option value="ger">🏠 Гэр хороолол</option>
              <option value="camp">🏕 Лагер</option>
              <option value="countryside">🚌 Орон нутаг (унаанд тавих)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">Үнэ (₮)</label>
            <input
              type="number"
              inputMode="numeric"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
              placeholder="Ж: 5000"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">АВАХ хаяг</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm"
                placeholder="Ж: БГД, 3-р хороо, 5-р хороолол…"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
              />
              <button
                type="button"
                onClick={handleGeocodeFrom}
                disabled={geoLoadingFrom}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-60"
              >
                {geoLoadingFrom ? "..." : "Хайх"}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Нэг удаа бөглөсний дараа дараагийн хүргэлтүүдэд автоматаар гарч ирнэ.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">ХҮРГЭХ хаяг</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm"
                placeholder="Ж: СБД, 6-р хороо, Энх тайвны өргөн чөлөө…"
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
              />
              <button
                type="button"
                onClick={handleGeocodeTo}
                disabled={geoLoadingTo}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-60"
              >
                {geoLoadingTo ? "..." : "Хайх"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">ХҮЛЭЭН АВАХ хүний утас</label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
              placeholder="Ж: 9911XXXX"
              value={receiverPhone}
              onChange={(e) => setReceiverPhone(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">Юу хүргүүлэх гэж байгаа (товч)</label>
            <textarea
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm h-20"
              placeholder="Ж: 2 хайрцаг ус, 1 тоног төхөөрөмж…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-xl bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700 disabled:bg-emerald-400 transition"
            >
              {sending ? "Илгээж байна…" : "Хүргэлт үүсгэх"}
            </button>

            <div className="mt-2 text-[11px] text-slate-500">
              Илгээх үед: координат олдохгүй бол map дээр 2 цэгээ байрлуулсны дараа илгээнэ.
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
