"use client";
export const dynamic = "force-dynamic";


import "leaflet/dist/leaflet.css";

import dynamicImport from "next/dynamic";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getDistrictOptions, getKhorooOptions } from "@/lib/ub_admin";

type Role = "seller" | "driver";

type IncomeUser = {
  id: string;
  role: Role;
  name: string;
  phone: string;
  email: string;
};

type LatLng = { lat: number; lng: number };

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

/**
 * ✅ Дүүргээр fallback хийх centroid цэгүүд
 */
const UB_DISTRICT_CENTROIDS: Record<string, LatLng> = {
  Багануур: { lat: 47.78, lng: 108.37 },
  Багахангай: { lat: 47.45, lng: 107.25 },
  Баянгол: { lat: 47.92, lng: 106.86 },
  Баянзүрх: { lat: 47.94, lng: 106.98 },
  Сүхбаатар: { lat: 47.92, lng: 106.92 },
  Сонгинохайрхан: { lat: 47.93, lng: 106.8 },
  "Хан-Уул": { lat: 47.88, lng: 106.92 },
  Чингэлтэй: { lat: 47.93, lng: 106.92 },
  Налайх: { lat: 47.77, lng: 107.5 },
};

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

async function geocodeTryMany(queries: string[]) {
  for (const q of queries) {
    const hit = await geocodeOne(q);
    if (hit) return hit;
  }
  return null;
}

function normalizeKhorooLabel(k: string) {
  const s = String(k || "").trim();
  if (!s) return "";

  // ✅ "1-р хороо" биш — "1 хороо"
  if (/^\d+$/.test(s)) return `${s} хороо`;

  // "1-р хороо" байвал "1 хороо" болгож цэвэрлэнэ
  if (s.includes("хороо"))
    return s.replace(/-р\s*/g, " ").replace(/\s+/g, " ").trim();

  return `${s} хороо`;
}

/**
 * ✅ Яг апп шиг icon-ууд
 * - АВАХ: 📦 (LOCK үед ногоон, EDIT үед улаан)
 * - ХҮРГЭХ: 👋
 */
function mapEmojiIcon(kind: "pickupLocked" | "pickupEdit" | "dropoff") {
  const html =
    kind === "dropoff"
      ? `<div style="
          width:34px;height:34px;border-radius:12px;
          background:#111827;color:#fff;
          display:flex;align-items:center;justify-content:center;
          font-size:18px;
          border:2px solid rgba(255,255,255,.75);
          box-shadow:0 6px 18px rgba(0,0,0,.22);
        ">👋</div>`
      : kind === "pickupEdit"
      ? `<div style="
          width:34px;height:34px;border-radius:12px;
          background:#ef4444;color:#fff;
          display:flex;align-items:center;justify-content:center;
          font-size:18px;
          border:2px solid rgba(255,255,255,.75);
          box-shadow:0 6px 18px rgba(0,0,0,.22);
        ">📦</div>`
      : `<div style="
          width:34px;height:34px;border-radius:12px;
          background:#10b981;color:#052e1b;
          display:flex;align-items:center;justify-content:center;
          font-size:18px;
          border:2px solid rgba(255,255,255,.75);
          box-shadow:0 6px 18px rgba(0,0,0,.22);
        ">📦</div>`;

  return L.divIcon({
    className: "",
    html,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

const LeafletMap = dynamicImport(
  async () => {
    const RL = await import("react-leaflet");
    const { MapContainer, TileLayer, Marker, Polyline } = RL;

    type Props = {
      center: LatLng;
      pickup: LatLng | null;
      dropoff: LatLng | null;
      pickupLocked: boolean;
      onPickupChange: (p: LatLng) => void;
      onDropoffChange: (p: LatLng) => void;
    };

    function Inner({
      center,
      pickup,
      dropoff,
      pickupLocked,
      onPickupChange,
      onDropoffChange,
    }: Props) {
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

        const bounds = L.latLngBounds(
          [pickup!.lat, pickup!.lng],
          [dropoff!.lat, dropoff!.lng]
        );
        mapRef.current.fitBounds(bounds.pad(0.25), { animate: true });
      }, [pickup, dropoff]);

      return (
        <MapContainer
          ref={(map) => {
            mapRef.current = (map as unknown as L.Map) || null;
          }}
          center={[center.lat, center.lng]}
          zoom={12}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors &copy; CARTO"
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />

          {isValidLatLng(pickup) && (
            <Marker
              position={[pickup!.lat, pickup!.lng]}
              draggable={!pickupLocked}
              icon={mapEmojiIcon(pickupLocked ? "pickupLocked" : "pickupEdit")}
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
              icon={mapEmojiIcon("dropoff")}
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
  },
  { ssr: false }
);

function SoftInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm",
        "placeholder:text-slate-400",
        "focus:outline-none focus:ring-2 focus:ring-emerald-200/70 focus:border-emerald-300",
        props.className || "",
      ].join(" ")}
    />
  );
}

function SoftTextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  return (
    <textarea
      {...props}
      className={[
        "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm",
        "placeholder:text-slate-400",
        "focus:outline-none focus:ring-2 focus:ring-emerald-200/70 focus:border-emerald-300",
        props.className || "",
      ].join(" ")}
    />
  );
}

function SoftSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm",
        "focus:outline-none focus:ring-2 focus:ring-emerald-200/70 focus:border-emerald-300",
        "disabled:opacity-60",
        props.className || "",
      ].join(" ")}
    />
  );
}

export default function NewDeliveryPage() {
  const router = useRouter();

  const [user, setUser] = useState<IncomeUser | null>(null);

  // ✅ АВАХ
  const [pickupDistrict, setPickupDistrict] = useState("");
  const [pickupKhoroo, setPickupKhoroo] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [pickupLocked, setPickupLocked] = useState(true);

  // ✅ ХҮРГЭХ
  const [dropoffDistrict, setDropoffDistrict] = useState("");
  const [dropoffKhoroo, setDropoffKhoroo] = useState("");
  const [dropoffPhone, setDropoffPhone] = useState("");
  const [toAddress, setToAddress] = useState("");

  // ✅ Ерөнхий
  const [deliveryType, setDeliveryType] = useState("apartment");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("");

  // Map
  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [dropoff, setDropoff] = useState<LatLng | null>(null);

  const [geoLoadingFrom, setGeoLoadingFrom] = useState(false);
  const [geoLoadingTo, setGeoLoadingTo] = useState(false);

  const [loadingUser, setLoadingUser] = useState(true);
  const [sending, setSending] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const ubCenter: LatLng = useMemo(() => ({ lat: 47.9186, lng: 106.917 }), []);

  const districtOptions = useMemo(() => getDistrictOptions(), []);
  const pickupKhorooOptions = useMemo(
    () => getKhorooOptions(pickupDistrict),
    [pickupDistrict]
  );
  const dropoffKhorooOptions = useMemo(
    () => getKhorooOptions(dropoffDistrict),
    [dropoffDistrict]
  );

  const readyForSubmit = Boolean(
    pickupDistrict &&
      pickupKhoroo &&
      dropoffDistrict &&
      dropoffKhoroo &&
      pickupPhone.trim() &&
      dropoffPhone.trim() &&
      price.trim() &&
      !isNaN(Number(price))
  );

  function buildPickupQueries() {
    const kh = normalizeKhorooLabel(pickupKhoroo);
    const extra = fromAddress.trim();

    const baseMn = `${pickupDistrict} дүүрэг, ${kh}, Улаанбаатар, Монгол`;
    const baseEn = `Ulaanbaatar, ${pickupDistrict} district, ${kh}, Mongolia`;

    const q1 = extra ? `${baseMn}, ${extra}` : baseMn;
    const q2 = extra ? `${baseEn}, ${extra}` : baseEn;

    const q3 = `${pickupDistrict} дүүрэг, Улаанбаатар, Монгол`;
    const q4 = `Ulaanbaatar, ${pickupDistrict} district, Mongolia`;

    return [q1, q2, q3, q4];
  }

  function buildDropoffQueries() {
    const kh = normalizeKhorooLabel(dropoffKhoroo);
    const extra = toAddress.trim();

    const baseMn = `${dropoffDistrict} дүүрэг, ${kh}, Улаанбаатар, Монгол`;
    const baseEn = `Ulaanbaatar, ${dropoffDistrict} district, ${kh}, Mongolia`;

    const q1 = extra ? `${baseMn}, ${extra}` : baseMn;
    const q2 = extra ? `${baseEn}, ${extra}` : baseEn;

    const q3 = `${dropoffDistrict} дүүрэг, Улаанбаатар, Монгол`;
    const q4 = `Ulaanbaatar, ${dropoffDistrict} district, Mongolia`;

    return [q1, q2, q3, q4];
  }

  // ✅ LOCK/EDIT товч:
  // - LOCK дээр “Засах”
  // - EDIT дээр “Хадгалах”
  function togglePickupEdit() {
    setPickupLocked((locked) => {
      const nextLocked = !locked;

      // Хадгалах (edit -> lock) үед: pickup байхгүй бол centroid тавина
      if (nextLocked) {
        let p = pickup;

        if (!isValidLatLng(p)) {
          const fb = UB_DISTRICT_CENTROIDS[pickupDistrict];
          if (fb) {
            p = fb;
            setPickup(fb);
          }
        }

        if (isValidLatLng(p)) {
          window.localStorage.setItem("incomeLastPickupLat", String(p!.lat));
          window.localStorage.setItem("incomeLastPickupLng", String(p!.lng));
        }
      }

      return nextLocked;
    });
  }

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

      const sPD = window.localStorage.getItem("incomeLastPickupDistrict");
      const sPK = window.localStorage.getItem("incomeLastPickupKhoroo");
      const sFrom = window.localStorage.getItem("incomeLastFromAddress");
      const sPickPhone = window.localStorage.getItem("incomeLastPickupPhone");

      if (sPD) setPickupDistrict(sPD);
      if (sPK) setPickupKhoroo(sPK);
      if (sFrom) setFromAddress(sFrom);
      if (sPickPhone) setPickupPhone(sPickPhone);

      const sLat = window.localStorage.getItem("incomeLastPickupLat");
      const sLng = window.localStorage.getItem("incomeLastPickupLng");
      if (sLat && sLng) {
        const lat = Number(sLat);
        const lng = Number(sLng);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) setPickup({ lat, lng });
      }

      setLoadingUser(false);
    } catch (e) {
      console.error(e);
      setError("Хэрэглэгчийн мэдээлэл уншихад алдаа гарлаа.");
      setLoadingUser(false);
    }
  }, [router]);

  // ✅ Pickup засаж буй үед дүүрэг солигдвол хороо/цэгийг цэвэрлэнэ
  useEffect(() => {
    if (pickupLocked) return;
    setPickupKhoroo("");
    setPickup(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupDistrict, pickupLocked]);

  useEffect(() => {
    setDropoffKhoroo("");
    setDropoff(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropoffDistrict]);

  // ✅ Автомат geocode (pickup зөвхөн EDIT үед)
  useEffect(() => {
    let canceled = false;
    const run = async () => {
      if (!pickupDistrict || !pickupKhoroo) return;
      if (pickupLocked) return;

      const p = await geocodeTryMany(buildPickupQueries());

      if (!canceled && p) setPickup(p);
      if (!canceled && !p) {
        const fb = UB_DISTRICT_CENTROIDS[pickupDistrict];
        if (fb) setPickup(fb);
      }
    };
    run();
    return () => {
      canceled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupDistrict, pickupKhoroo, pickupLocked]);

  useEffect(() => {
    let canceled = false;
    const run = async () => {
      if (!dropoffDistrict || !dropoffKhoroo) return;

      const p = await geocodeTryMany(buildDropoffQueries());

      if (!canceled && p) setDropoff(p);
      if (!canceled && !p) {
        const fb = UB_DISTRICT_CENTROIDS[dropoffDistrict];
        if (fb) setDropoff(fb);
      }
    };
    run();
    return () => {
      canceled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropoffDistrict, dropoffKhoroo]);

  async function handleGeocodeFrom() {
    setError(null);

    if (!pickupDistrict || !pickupKhoroo) {
      return setError("АВАХ дүүрэг/хороо сонгоно уу.");
    }

    try {
      setGeoLoadingFrom(true);
      const p = await geocodeTryMany(buildPickupQueries());

      if (!p) {
        const fb = UB_DISTRICT_CENTROIDS[pickupDistrict];
        if (fb) {
          setPickup(fb);
          return setError("АВАХ хаяг олдсонгүй. Цэгийг чирж тааруулна уу.");
        }
        return setError("АВАХ байрлал олдсонгүй.");
      }

      setPickup(p);
    } catch (e) {
      console.error(e);
      setError("АВАХ байрлал хайхад алдаа гарлаа.");
    } finally {
      setGeoLoadingFrom(false);
    }
  }

  async function handleGeocodeTo() {
    setError(null);

    if (!dropoffDistrict || !dropoffKhoroo) {
      return setError("ХҮРГЭХ дүүрэг/хороо сонгоно уу.");
    }

    try {
      setGeoLoadingTo(true);
      const p = await geocodeTryMany(buildDropoffQueries());

      if (!p) {
        const fb = UB_DISTRICT_CENTROIDS[dropoffDistrict];
        if (fb) {
          setDropoff(fb);
          return setError("ХҮРГЭХ хаяг олдсонгүй. Цэгийг чирж тааруулна уу.");
        }
        return setError("ХҮРГЭХ байрлал олдсонгүй.");
      }

      setDropoff(p);
    } catch (e) {
      console.error(e);
      setError("ХҮРГЭХ байрлал хайхад алдаа гарлаа.");
    } finally {
      setGeoLoadingTo(false);
    }
  }

  async function ensureCoordsBeforeSubmit() {
    if (!isValidLatLng(pickup) && pickupDistrict && pickupKhoroo) {
      const p = await geocodeTryMany(buildPickupQueries());
      if (p) setPickup(p);
      else {
        const fb = UB_DISTRICT_CENTROIDS[pickupDistrict];
        if (fb) setPickup(fb);
      }
    }

    if (!isValidLatLng(dropoff) && dropoffDistrict && dropoffKhoroo) {
      const p = await geocodeTryMany(buildDropoffQueries());
      if (p) setDropoff(p);
      else {
        const fb = UB_DISTRICT_CENTROIDS[dropoffDistrict];
        if (fb) setDropoff(fb);
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setError(null);
    setSuccess(false);

    if (!pickupDistrict || !pickupKhoroo)
      return setError("АВАХ дүүрэг/хороо заавал.");
    if (!dropoffDistrict || !dropoffKhoroo)
      return setError("ХҮРГЭХ дүүрэг/хороо заавал.");

    if (!pickupPhone.trim()) return setError("АВАХ утас заавал.");
    if (!dropoffPhone.trim()) return setError("ХҮРГЭХ утас заавал.");

    if (!price.trim() || isNaN(Number(price)))
      return setError("Үнэ (₮) зөв оруулна уу.");

    try {
      setSending(true);

      await ensureCoordsBeforeSubmit();

      const hasPick = isValidLatLng(pickup);
      const hasDrop = isValidLatLng(dropoff);

      if (!hasPick || !hasDrop) {
        setSending(false);
        setError("Map дээр цэгүүдээ байрлуулаад дахин илгээнэ үү.");
        return;
      }

      const { error: insertError } = await supabase.from("deliveries").insert({
        seller_id: user.id,

        delivery_type: deliveryType,

        pickup_district: pickupDistrict,
        pickup_khoroo: pickupKhoroo,
        dropoff_district: dropoffDistrict,
        dropoff_khoroo: dropoffKhoroo,

        from_address: fromAddress,
        to_address: toAddress,

        pickup_contact_phone: pickupPhone,
        dropoff_contact_phone: dropoffPhone,

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

      window.localStorage.setItem("incomeLastPickupDistrict", pickupDistrict);
      window.localStorage.setItem("incomeLastPickupKhoroo", pickupKhoroo);
      window.localStorage.setItem("incomeLastFromAddress", fromAddress);
      window.localStorage.setItem("incomeLastPickupPhone", pickupPhone);

      if (pickup) {
        window.localStorage.setItem("incomeLastPickupLat", String(pickup.lat));
        window.localStorage.setItem("incomeLastPickupLng", String(pickup.lng));
      }

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

  // ✅ pickup card disabled style
  const pickupCardDisabled = pickupLocked;

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
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-slate-500">
                INCOME · Seller
              </div>
              <div className="text-2xl font-extrabold tracking-tight text-slate-900">
                + Шинэ хүргэлт
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Товч бөглөөд шууд үүсгэнэ.
              </div>
            </div>

            <button
              onClick={() => router.push("/seller")}
              className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300"
            >
              ← Буцах
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-700">
              Хүргэлт амжилттай үүсгэгдлээ!
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Map */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Газрын зураг
              </div>
            </div>

            <button
              type="button"
              onClick={togglePickupEdit}
              className={[
                "rounded-xl border px-3 py-2 text-xs font-semibold",
                pickupLocked
                  ? "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                  : "border-red-200 bg-red-50 text-red-900 hover:bg-red-100/70",
              ].join(" ")}
              title={pickupLocked ? "АВАХ-ыг засах" : "АВАХ-ыг хадгалах"}
            >
              {pickupLocked ? "Засах" : "Хадгалах"}
            </button>
          </div>

          <div className="mt-3 h-[300px] w-full overflow-hidden rounded-2xl border border-slate-200">
            <LeafletMap
              center={mapCenter}
              pickup={pickup}
              dropoff={dropoff}
              pickupLocked={pickupLocked}
              onPickupChange={setPickup}
              onDropoffChange={setDropoff}
            />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Pickup (disabled when locked) */}
          <div
            className={[
              "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm",
              pickupCardDisabled ? "opacity-60" : "",
            ].join(" ")}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">АВАХ</div>

              <button
                type="button"
                onClick={() => void handleGeocodeFrom()}
                disabled={geoLoadingFrom || pickupLocked}
                className={[
                  "rounded-xl border px-3 py-2 text-xs font-semibold",
                  geoLoadingFrom || pickupLocked
                    ? "border-slate-200 bg-slate-100 text-slate-500"
                    : "border-emerald-200 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100/70",
                ].join(" ")}
                title="АВАХ хаягаар ойролцоо цэг хайх"
              >
                {geoLoadingFrom ? "Хайж байна…" : "Хаягаар хайх"}
              </button>
            </div>

            <div
              className={pickupLocked ? "pointer-events-none select-none" : ""}
            >
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    Дүүрэг (заавал)
                  </div>
                  <SoftSelect
                    value={pickupDistrict}
                    onChange={(e) => setPickupDistrict(e.target.value)}
                    disabled={pickupLocked}
                  >
                    <option value="">Сонгох</option>
                    {districtOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </SoftSelect>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    Хороо (заавал)
                  </div>
                  <SoftSelect
                    value={pickupKhoroo}
                    onChange={(e) => setPickupKhoroo(e.target.value)}
                    disabled={pickupLocked || !pickupDistrict}
                  >
                    <option value="">Сонгох</option>
                    {pickupKhorooOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </SoftSelect>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    Утас (заавал)
                  </div>
                  <SoftInput
                    placeholder="Ж: 9911XXXX"
                    value={pickupPhone}
                    onChange={(e) => setPickupPhone(e.target.value)}
                    disabled={pickupLocked}
                  />
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    Дэлгэрэнгүй хаяг (сонголт)
                  </div>
                  <SoftInput
                    placeholder="Гудамж, байр, тоот…"
                    value={fromAddress}
                    onChange={(e) => setFromAddress(e.target.value)}
                    disabled={pickupLocked}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dropoff */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">ХҮРГЭХ</div>

              <button
                type="button"
                onClick={() => void handleGeocodeTo()}
                disabled={geoLoadingTo}
                className={[
                  "rounded-xl border px-3 py-2 text-xs font-semibold",
                  geoLoadingTo
                    ? "border-slate-200 bg-slate-100 text-slate-500"
                    : "border-emerald-200 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100/70",
                ].join(" ")}
                title="ХҮРГЭХ хаягаар ойролцоо цэг хайх"
              >
                {geoLoadingTo ? "Хайж байна…" : "Хаягаар хайх"}
              </button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[11px] font-semibold text-slate-500">
                  Дүүрэг (заавал)
                </div>
                <SoftSelect
                  value={dropoffDistrict}
                  onChange={(e) => setDropoffDistrict(e.target.value)}
                >
                  <option value="">Сонгох</option>
                  {districtOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </SoftSelect>
              </div>

              <div>
                <div className="text-[11px] font-semibold text-slate-500">
                  Хороо (заавал)
                </div>
                <SoftSelect
                  value={dropoffKhoroo}
                  onChange={(e) => setDropoffKhoroo(e.target.value)}
                  disabled={!dropoffDistrict}
                >
                  <option value="">Сонгох</option>
                  {dropoffKhorooOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </SoftSelect>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[11px] font-semibold text-slate-500">
                  Утас (заавал)
                </div>
                <SoftInput
                  placeholder="Ж: 9911XXXX"
                  value={dropoffPhone}
                  onChange={(e) => setDropoffPhone(e.target.value)}
                />
              </div>

              <div>
                <div className="text-[11px] font-semibold text-slate-500">
                  Дэлгэрэнгүй хаяг (сонголт)
                </div>
                <SoftInput
                  placeholder="Гудамж, байр, тоот…"
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Compact details */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">
              Юу хүргэх · Үнэ
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[11px] font-semibold text-slate-500">
                  Үнэ (₮) — заавал
                </div>
                <SoftInput
                  inputMode="numeric"
                  placeholder="Ж: 15000"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>

              <div>
                <div className="text-[11px] font-semibold text-slate-500">
                  Төрөл (товч)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "apartment", label: "Орон сууц" },
                    { id: "ger", label: "Гэр" },
                    { id: "camp", label: "Camp" },
                  ].map((x) => {
                    const active = deliveryType === x.id;
                    return (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => setDeliveryType(x.id)}
                        className={[
                          "rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                          active
                            ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        {x.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-3">
              <div className="text-[11px] font-semibold text-slate-500">
                Тайлбар (сонголт)
              </div>
              <SoftTextArea
                rows={3}
                placeholder="Ж: 2 хайрцаг, эмзэг, түргэн…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          {/* Submit */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <button
              type="submit"
              disabled={!readyForSubmit || sending}
              className={[
                "w-full rounded-2xl px-4 py-3 text-sm font-extrabold tracking-tight text-white",
                sending || !readyForSubmit
                  ? "bg-emerald-300"
                  : "bg-emerald-600 hover:bg-emerald-700",
              ].join(" ")}
            >
              {sending ? "Илгээж байна…" : "Хүргэлт үүсгэх"}
            </button>

            <div className="mt-2 text-[11px] text-slate-500 text-center">
              Дүүрэг/хороо · 2 утас · үнэ — бүрэн байвал илгээнэ.
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
