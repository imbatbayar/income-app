"use client";

import DeliveryRouteMap from "@/app/components/Map/DeliveryRouteMap";

type DeliveryPosterData = {
  id: string;
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

function area(d?: string | null, k?: string | null) {
  if (d && k) return `${d} · ${k}-р хороо`;
  return d || k || "—";
}
function price(n?: number | null) {
  if (!n) return "—";
  return `${Number(n).toLocaleString("mn-MN")}₮`;
}

export default function DeliveryPosterCard({ d }: { d: DeliveryPosterData }) {
  const hasMap =
    Number.isFinite(Number(d.pickup_lat)) &&
    Number.isFinite(Number(d.pickup_lng)) &&
    Number.isFinite(Number(d.dropoff_lat)) &&
    Number.isFinite(Number(d.dropoff_lng));

  return (
    <div className="w-[1080px] h-[1080px] bg-[#f6f7f9] p-[44px] rounded-[36px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-[18px]">
        <div className="text-[34px] font-[900] tracking-[0.5px] text-[#0f172a]">
          INCOME
        </div>
        <div className="text-[20px] font-[900] text-[#16a34a] tracking-[0.2px]">
          ХҮРГҮҮЛЭХ САНАЛ
        </div>
      </div>

      {/* Map */}
      <div className="rounded-[28px] border border-[#dbe3ea] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.10)] overflow-hidden">
        <div className="h-[560px]">
          {hasMap ? (
            <DeliveryRouteMap
              pickup={{ lat: d.pickup_lat!, lng: d.pickup_lng! }}
              dropoff={{ lat: d.dropoff_lat!, lng: d.dropoff_lng! }}
            />
          ) : (
            <div className="h-full grid place-items-center text-[#64748b] text-[22px] font-[800]">
              Газрын зурагт цэг тавиагүй байна
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="mt-[28px] grid grid-cols-12 gap-[18px]">
        <div className="col-span-7 rounded-[24px] bg-white border border-[#e2e8f0] p-[24px]">
          <Row label="ХААНААС" value={area(d.pickup_district, d.pickup_khoroo)} />
          <Row label="ХААШАА" value={area(d.dropoff_district, d.dropoff_khoroo)} />
          <Row label="ТАЙЛБАР" value={(d.note || "—").trim() || "—"} />
        </div>

        <div className="col-span-5 rounded-[24px] bg-[#0f172a] text-white p-[24px] border border-[#0b1220] shadow-[0_18px_40px_rgba(2,6,23,0.28)]">
          <div className="text-[18px] font-[900] opacity-80">ҮНЭ</div>
          <div className="mt-[8px] text-[54px] font-[900] tracking-[0.2px]">
            {price(d.price_mnt)}
          </div>

          <div className="mt-[18px] text-[20px] font-[800] leading-[1.3]">
            Та хүргүүлэх саналаа татаж аваад хүссэн групп/пэйж рүүгээ пост
            хийгээрэй.
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-[22px] rounded-[18px] bg-[#e9f7ee] border border-[#bfe8cc] px-[18px] py-[14px] text-[16px] font-[900] text-[#166534]">
        #INCOME · {d.id}
      </div>
    </div>
  );
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
