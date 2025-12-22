"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as htmlToImage from "html-to-image";
import DeliveryPosterCard from "@/app/components/Poster/DeliveryPosterCard";
import type { ShareDeliveryPayload } from "@/lib/shareDelivery";

type PosterPayload = ShareDeliveryPayload & {
  price_mnt?: number | null;
  pickup_district?: string | null;
  pickup_khoroo?: string | null;
  dropoff_district?: string | null;
  dropoff_khoroo?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
};

export default function ShareDeliveryButton({
  payload,
  className,
  onToast,
}: {
  payload: PosterPayload;
  className?: string;
  onToast?: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const posterOuterRef = useRef<HTMLDivElement | null>(null);
  const posterMeasureRef = useRef<HTMLDivElement | null>(null);
  const posterRef = useRef<HTMLDivElement | null>(null);

  // ✅ Preview scale-ийг автоматаар тааруулах
  const [scale, setScale] = useState(0.58);

  function close() {
    if (!busy) setOpen(false);
  }

  // poster wrapper хэмжээнээс scale бодож өгнө
  useLayoutEffect(() => {
    if (!open) return;

    const outer = posterOuterRef.current;
    const meas = posterMeasureRef.current;
    if (!outer || !meas) return;

    const calc = () => {
      const ow = outer.clientWidth;
      const oh = outer.clientHeight;

      const mw = meas.scrollWidth;
      const mh = meas.scrollHeight;

      if (!mw || !mh || !ow || !oh) return;

      // 0.52–0.92 хооронд барина (хэт жижиг/том болохоос сэргийлнэ)
      const s = Math.min(ow / mw, oh / mh);
      const clamped = Math.max(0.52, Math.min(0.92, s));
      setScale(clamped);
    };

    calc();

    const ro = new ResizeObserver(() => calc());
    ro.observe(outer);

    return () => ro.disconnect();
  }, [open]);

  async function downloadPoster() {
    if (!posterRef.current) return;

    try {
      setBusy(true);

      // map tiles render-д жаахан амьсгаа өг
      await new Promise((r) => setTimeout(r, 650));

      const dataUrl = await htmlToImage.toPng(posterRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        // зарим тохиолдолд fonts/tile latency дээр хэрэгтэй
        backgroundColor: "#ffffff",
      });

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `INCOME_poster_${payload.id}.png`;
      a.click();

      onToast?.("PNG татлаа ✅");
    } catch {
      onToast?.("Постер татаж чадсангүй. Газрын зураг бүрэн ачаалсан эсэхийг шалга.");
    } finally {
      setBusy(false);
    }
  }

  // ✅ Tooltip маягийн “Photo” товчийг таны ногоонтой нийцүүлнэ
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          "rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:border-slate-300"
        }
      >
        Photo
      </button>

      {open && (
        <div className="fixed inset-0 z-[90]">
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={close} />

          {/* sheet */}
          <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[560px] overflow-hidden rounded-t-3xl bg-white shadow-2xl">
            {/* header (брэнд ногоон) */}
            <div
              className="px-4 pt-4 pb-3"
              style={{
                background:
                  "linear-gradient(180deg, rgba(11,143,90,0.12) 0%, rgba(11,143,90,0.00) 70%)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div
                    className="text-[15px] font-extrabold tracking-tight"
                    style={{ color: "var(--income-ink, #0F172A)" }}
                  >
                    Хүргэлтийн постер
                  </div>
                  <div className="mt-1 text-[12px] font-semibold text-slate-600">
                    Та хүргүүлэх саналаа татаж аваад хүссэн групп/пэйж рүүгээ пост хийгээрэй.
                  </div>
                </div>

                <button
                  onClick={close}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-slate-300"
                >
                  Хаах
                </button>
              </div>
            </div>

            {/* poster viewport */}
            <div className="px-3">
              <div
                ref={posterOuterRef}
                className="rounded-3xl border border-slate-200 bg-slate-50"
                style={{
                  height: "calc(100vh - 220px)", // ✅ хамгийн чухал: нээгдэхэд шууд харагдана
                  overflow: "hidden",
                }}
              >
                <div className="h-full w-full flex items-start justify-center pt-3">
                  <div
                    style={{
                      transform: `scale(${scale})`,
                      transformOrigin: "top center",
                    }}
                  >
                    {/* хэмжилтийн wrapper (scale тооцоход) */}
                    <div ref={posterMeasureRef}>
                      {/* export хийх бодит node */}
                      <div ref={posterRef}>
                        <DeliveryPosterCard
                          d={{
                            id: payload.id,
                            price_mnt: payload.price_mnt ?? null,
                            note: payload.note ?? "",
                            pickup_district: payload.pickup_district ?? null,
                            pickup_khoroo: payload.pickup_khoroo ?? null,
                            dropoff_district: payload.dropoff_district ?? null,
                            dropoff_khoroo: payload.dropoff_khoroo ?? null,
                            pickup_lat: payload.pickup_lat ?? null,
                            pickup_lng: payload.pickup_lng ?? null,
                            dropoff_lat: payload.dropoff_lat ?? null,
                            dropoff_lng: payload.dropoff_lng ?? null,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2 px-1 text-[11px] font-semibold text-slate-500">
                * Газрын зураг бүрэн ачаалсны дараа PNG илүү цэвэр гарна.
              </div>
            </div>

            {/* actions */}
            <div className="mt-3 border-t border-slate-200 bg-white px-3 py-3">
              <button
                onClick={downloadPoster}
                disabled={busy}
                className="w-full rounded-2xl py-3 text-sm font-extrabold text-white disabled:opacity-60"
                style={{
                  background: busy ? "#0B8F5A80" : "var(--income-green, #0B8F5A)",
                }}
              >
                {busy ? "Бэлтгэж байна…" : "PNG татах"}
              </button>

              <button
                onClick={close}
                disabled={busy}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-800 hover:border-slate-300 disabled:opacity-60"
              >
                Буцах
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
