"use client";

import DeliveryRouteMap from "@/app/components/Map/DeliveryRouteMap";

export type DeliveryPosterData = {
  id: string | number;
  price_mnt: number | null;
  note: string | null;
  pickup_district: string | null;
  pickup_khoroo: string | null;
  dropoff_district: string | null;
  dropoff_khoroo: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
};

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `${Number(n).toLocaleString("mn-MN")}₮`;
}

function toNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function inRangeLatLng(lat: number, lng: number) {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-[16px] py-[10px] border-b border-[#eef2f7] last:border-b-0">
      <div className="w-[150px] text-[18px] font-[900] text-[#166534]">
        {label}
      </div>
      <div className="flex-1 text-[22px] font-[900] text-[#0f172a] leading-[1.25]">
        {value}
      </div>
    </div>
  );
}

/**
 * ✅ Compatibility fix:
 * - Зарим газар <DeliveryPosterCard delivery={...} /> гэж дууддаг.
 * - Зарим газар <DeliveryPosterCard d={...} /> гэж дууддаг.
 * Энэ component 2 хэлбэрийг хоёуланг нь дэмжинэ.
 */
export default function DeliveryPosterCard({
  d,
  delivery,
}: {
  d?: DeliveryPosterData;
  delivery?: DeliveryPosterData;
}) {
  const data = (d ?? delivery) as DeliveryPosterData | undefined;

  // хамгаалалт (хэрэв өгөгдөл ирээгүй бол)
  if (!data) {
    return (
      <div className="w-[1080px] h-[1080px] bg-[#f6f7f9] p-[44px] rounded-[36px] overflow-hidden flex items-center justify-center">
        <div className="text-[22px] font-[900] text-[#0f172a] opacity-70">
          Poster өгөгдөл олдсонгүй
        </div>
      </div>
    );
  }

  const pLat = toNum(data.pickup_lat);
  const pLng = toNum(data.pickup_lng);
  const dLat = toNum(data.dropoff_lat);
  const dLng = toNum(data.dropoff_lng);

  const hasMap =
    pLat != null &&
    pLng != null &&
    dLat != null &&
    dLng != null &&
    inRangeLatLng(pLat, pLng) &&
    inRangeLatLng(dLat, dLng);

  const fromText =
    (data.pickup_district || "—") +
    (data.pickup_khoroo ? ` · ${data.pickup_khoroo}` : "");
  const toText =
    (data.dropoff_district || "—") +
    (data.dropoff_khoroo ? ` · ${data.dropoff_khoroo}` : "");

  const noteText = (data.note || "").trim() || "—";

  return (
    <div className="w-[1080px] h-[1080px] bg-[#f6f7f9] p-[44px] rounded-[36px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-[18px]">
        <div className="text-[34px] font-[900] tracking-tight text-[#0f172a]">
          INCOME
        </div>
        <div className="text-[20px] font-[900] text-[#16a34a]">
          ХҮРГҮҮЛЭХ САНАЛ
        </div>
      </div>

      {/* Map */}
      <div className="rounded-[26px] bg-white p-[18px] border border-[#e7edf4]">
        <div className="rounded-[22px] overflow-hidden border border-[#eef2f7]">
          {hasMap ? (
            <DeliveryRouteMap
              pickup={{ lat: pLat!, lng: pLng! }}
              dropoff={{ lat: dLat!, lng: dLng! }}
              aspectRatio="16/9"
            />
          ) : (
            <div
              className="w-full bg-[#f1f5f9] flex items-center justify-center text-[#64748b] font-[800]"
              style={{ aspectRatio: "16/9" }}
            >
              Газрын зураг байхгүй
            </div>
          )}
        </div>

        {/* Info + Price */}
        <div className="mt-[18px] grid grid-cols-12 gap-[18px]">
          {/* left info */}
          <div className="col-span-7 rounded-[22px] bg-white border border-[#eef2f7] p-[18px]">
            <Row label="ХААНААС" value={fromText} />
            <Row label="ХААШАА" value={toText} />
            <Row label="ТАЙЛБАР" value={noteText} />
          </div>

          {/* right price */}
          <div className="col-span-5 rounded-[22px] bg-[#0b1220] text-white p-[22px] flex flex-col justify-between">
            <div className="text-[14px] font-[900] opacity-80">Үнэ</div>

            <div className="mt-[6px] text-[60px] font-[900] leading-none">
              {money(data.price_mnt)}
            </div>

            <div className="mt-[10px] text-[15px] font-[800] leading-[1.35] text-white/90">
              Та INCOME апп-ыг суулгаснаар хүргэлт хийлгэх саналуудыг дэлгэрэнгүй
              үзэж болно.
            </div>
          </div>
        </div>

        {/* Footer id */}
        <div className="mt-[14px] rounded-[14px] bg-[#e8f5ec] border border-[#bfe7c9] px-[14px] py-[10px]">
          <div className="text-[12px] font-[900] text-[#166534]">
            #INCOME • {String(data.id)}
          </div>
        </div>
      </div>
    </div>
  );
}
