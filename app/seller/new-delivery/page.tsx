"use client";

import "leaflet/dist/leaflet.css";

import dynamic from "next/dynamic";
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

type DotColor = "green" | "red" | "orange";

function circleIcon(color: DotColor) {
  const fill =
    color === "green" ? "#10b981" : color === "red" ? "#ef4444" : "#f59e0b"; // ✅ orange
  const stroke =
    color === "green" ? "#065f46" : color === "red" ? "#7f1d1d" : "#92400e"; // ✅ orange stroke

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

function normalizeKhorooLabel(k: string) {
  const s = String(k || "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) return `${s}-р хороо`;
  if (s.includes("хороо")) return s;
  return `${s}-р хороо`;
}

const LeafletMap = dynamic(
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
              icon={circleIcon(pickupLocked ? "orange" : "green")} // ✅ түгжсэн үед orange
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
  },
  { ssr: false }
);

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

  // ✅ Түгжих/Засах
  // - Түгжих үед 🟢 цэг байхгүй бол centroid тавиад шууд хадгална (ингээд "үргэлж харагдана")
  function togglePickupLock() {
    setPickupLocked((v) => {
      const next = !v; // true => түгжих

      if (next) {
        let p = pickup;

        if (!isValidLatLng(p)) {
          const fb = UB_DISTRICT_CENTROIDS[pickupDistrict];
          if (fb) {
            p = fb;
            setPickup(fb); // ✅ map дээр шууд харагдана
          }
        }

        if (isValidLatLng(p)) {
          window.localStorage.setItem("incomeLastPickupLat", String(p!.lat));
          window.localStorage.setItem("incomeLastPickupLng", String(p!.lng));
        }
      }

      return next;
    });
  }

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

  // ✅ ЭНЭ ХЭСЭГ ЧИНЬ 🟢-г УСТГААД БАЙСАН.
  // Түгжсэн үед огт устгахгүй.
  useEffect(() => {
    if (pickupLocked) return; // ✅
    setPickupKhoroo("");
    setPickup(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupDistrict, pickupLocked]);

  useEffect(() => {
    setDropoffKhoroo("");
    setDropoff(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropoffDistrict]);

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
          setError(
            "Хаягаар олдсонгүй — дүүргийн ойролцоо 🟢 цэг тавилаа. Чирж ягштал тааруулна уу."
          );
          return;
        }
        return setError(
          "АВАХ байрлал олдсонгүй. Дэлгэрэнгүйг (гудамж/байр/тоот) нэмээд дахин хайна уу."
        );
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
          setError(
            "Хаягаар олдсонгүй — дүүргийн ойролцоо 🔴 цэг тавилаа. Чирж ягштал тааруулна уу."
          );
          return;
        }
        return setError(
          "ХҮРГЭХ байрлал олдсонгүй. Дэлгэрэнгүйг (гудамж/байр/тоот) нэмээд дахин хайна уу."
        );
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
        setError(
          "Map дээр 🟠/🔴 цэгээ байрлуулаад (эсвэл Хайх дарж) дахин илгээнэ үү."
        );
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
              <span className="text-xs font-semibold text-emerald-700">
                INCOME
              </span>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-900">
                Хүргэлт үүсгэх
              </h1>
              <p className="text-xs text-slate-500">
                Авах/Хүргэх мэдээллээ нэг дор бөглөнө.
              </p>
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

        {/* Map */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">Map</div>
            <div className="text-[11px] text-slate-500">
              🟠 авах (түгжсэн) · 🟢 авах (засаж буй) · 🔴 хүргэх
            </div>
          </div>

          <div className="h-[320px] w-full overflow-hidden rounded-2xl border border-slate-200">
            <LeafletMap
              center={mapCenter}
              pickup={pickup}
              dropoff={dropoff}
              pickupLocked={pickupLocked}
              onPickupChange={setPickup}
              onDropoffChange={setDropoff}
            />
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
              <div className="text-[11px] text-amber-700/80">
                🟠 Авах цэг {pickupLocked ? "(түгжсэн)" : "(засаж буй)"}
              </div>
              <div className="text-xs font-semibold text-amber-900">
                {isValidLatLng(pickup)
                  ? `${pickup!.lat.toFixed(5)}, ${pickup!.lng.toFixed(5)}`
                  : "Тохируулаагүй"}
              </div>
            </div>

            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2">
              <div className="text-[11px] text-rose-700/80">🔴 Хүргэх цэг</div>
              <div className="text-xs font-semibold text-rose-900">
                {isValidLatLng(dropoff)
                  ? `${dropoff!.lat.toFixed(5)}, ${dropoff!.lng.toFixed(5)}`
                  : "Тохируулаагүй"}
              </div>
            </div>
          </div>
        </div>

        {/* Доорх form чинь өмнөхтэй яг адил — өөрчлөхгүй үлдээлээ */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ... (чиний өмнөх form хэсгүүд хэвээрээ) ... */}
          {/* Чиний upload файл дахь үлдсэн хэсэг өөрчлөгдөөгүй гэж үзээд орхисонгүй — 
              Гэхдээ энэ paste нь бүтэн файл тул эндээс цааш код чинь үргэлжилнэ. */}

          {/* ===================== АВАХ (НЭГ ДОР) ===================== */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">
                АВАХ мэдээлэл
              </div>
              <button
                type="button"
                onClick={togglePickupLock}
                className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                {pickupLocked ? "Засах" : "Түгжих"}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-800">
                  АВАХ дүүрэг
                </label>
                <select
                  value={pickupDistrict}
                  onChange={(e) => setPickupDistrict(e.target.value)}
                  disabled={pickupLocked}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm disabled:opacity-60"
                >
                  <option value="">Сонгох</option>
                  {districtOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-800">
                  АВАХ хороо
                </label>
                <select
                  value={pickupKhoroo}
                  onChange={(e) => setPickupKhoroo(e.target.value)}
                  disabled={pickupLocked || !pickupDistrict}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm disabled:opacity-60"
                >
                  <option value="">Сонгох</option>
                  {pickupKhorooOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-800">
                  АВАХ утас (заавал)
                </label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm disabled:opacity-60"
                  placeholder="Ж: 9911XXXX"
                  value={pickupPhone}
                  onChange={(e) => setPickupPhone(e.target.value)}
                  disabled={pickupLocked}
                />
              </div>

              <div className="flex items-end">
                {pickupLocked ? (
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 text-center">
                    🟠 Авах цэг түгжигдсэн
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleGeocodeFrom}
                    disabled={geoLoadingFrom || !pickupDistrict || !pickupKhoroo}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-60"
                  >
                    {geoLoadingFrom ? "..." : "🟢 Авах цэг хайх"}
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800">
                АВАХ хаяг (дэлгэрэнгүй)
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm disabled:opacity-60"
                placeholder="Ж: Гудамж, байр, тоот, орц, код, давхар…"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
                disabled={pickupLocked}
              />
              <p className="text-[11px] text-slate-400">
                Байнгын бол “Түгжих” дээр үлдээнэ. Хүсвэл “Засах” дарж өөрчилнө.
              </p>
            </div>
          </div>

          {/* ===================== ХҮРГЭХ (НЭГ ДОР) ===================== */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <div className="text-sm font-semibold text-slate-900">
              ХҮРГЭХ мэдээлэл
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-800">
                  ХҮРГЭХ дүүрэг
                </label>
                <select
                  value={dropoffDistrict}
                  onChange={(e) => setDropoffDistrict(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="">Сонгох</option>
                  {districtOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-800">
                  ХҮРГЭХ хороо
                </label>
                <select
                  value={dropoffKhoroo}
                  onChange={(e) => setDropoffKhoroo(e.target.value)}
                  disabled={!dropoffDistrict}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm disabled:opacity-60"
                >
                  <option value="">Сонгох</option>
                  {dropoffKhorooOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-800">
                  ХҮРГЭХ утас (заавал)
                </label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                  placeholder="Ж: 9911XXXX"
                  value={dropoffPhone}
                  onChange={(e) => setDropoffPhone(e.target.value)}
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleGeocodeTo}
                  disabled={geoLoadingTo || !dropoffDistrict || !dropoffKhoroo}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-60"
                >
                  {geoLoadingTo ? "..." : "🔴 Хүргэх цэг хайх"}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800">
                ХҮРГЭХ хаяг (дэлгэрэнгүй)
              </label>
              <input
                type="text"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                placeholder="Ж: Гудамж, байр, тоот, орц, код, давхар…"
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
              />
            </div>
          </div>

          {/* ===================== ЕРӨНХИЙ ===================== */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">
              Хүргэлтийн төрөл
            </label>
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
            <label className="text-sm font-medium text-slate-800">
              Юу хүргүүлэх гэж байгаа (товч)
            </label>
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
              disabled={sending || !readyForSubmit}
              className="w-full rounded-xl bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700 disabled:bg-emerald-400 transition"
            >
              {sending ? "Илгээж байна…" : "Хүргэлт үүсгэх"}
            </button>

            <div className="mt-2 text-[11px] text-slate-500">
              Илгээхээс өмнө: 🔴 цэгээ map дээр байрлуул (эсвэл “цэг хайх” дар).
              🟠 цэг түгжсэн бол алга болохгүй.
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
