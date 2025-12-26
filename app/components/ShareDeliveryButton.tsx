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
  onToast,
  className,
  disabled,
}: {
  payload: PosterPayload;
  onToast?: (t: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const posterRef = useRef<HTMLDivElement | null>(null);

  const outerRef = useRef<HTMLDivElement | null>(null);
  const posterMeasureRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  const close = () => {
    setOpen(false);
    setBusy(false);
  };

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // scale preview so 1080 poster fits nicely
  useLayoutEffect(() => {
    if (!open) return;

    const calc = () => {
      const outer = outerRef.current;
      const meas = posterMeasureRef.current;
      if (!outer || !meas) return;

      const outerW = outer.clientWidth;
      const outerH = outer.clientHeight;

      const base = 1080;

      const maxW = Math.max(1, outerW - 24);
      const maxH = Math.max(1, outerH - 24);

      const s = Math.min(maxW / base, maxH / base, 1);
      setScale(Number.isFinite(s) ? s : 1);
    };

    calc();
    const ro = new ResizeObserver(calc);
    if (outerRef.current) ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, [open]);

  async function downloadPoster() {
    if (!posterRef.current) return;

    try {
      setBusy(true);

      // leaflet/map render тогтворжуулах жижиг pause
      await new Promise((r) => setTimeout(r, 650));

      const node = posterRef.current;

      const dataUrl = await htmlToImage.toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#f6f7f9",
      });

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `INCOME_delivery_${payload.id}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      onToast?.("PNG татагдлаа.");
    } catch (e) {
      console.error(e);
      onToast?.("PNG татахад алдаа гарлаа.");
    } finally {
      setBusy(false);
    }
  }

  const btnCls = useMemo(() => {
    const base =
      "inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-extrabold";
    return `${base} ${className || ""}`;
  }, [className]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        className={btnCls}
        onClick={() => setOpen(true)}
      >
        💾 Постер
      </button>

      {open && (
        <div className="fixed inset-0 z-9999">
          {/* overlay */}
          <div
            className="absolute inset-0 bg-black/50 z-0"
            onClick={close}
            aria-hidden="true"
          />

          {/* centered modal */}
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4 sm:p-6">
            <div className="w-full max-w-[760px]">
              {/* modal card */}
              <div
                className="rounded-[26px] bg-white shadow-2xl overflow-hidden"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                {/* header */}
                <div
                  className="px-5 pt-5 pb-4"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(11,143,90,0.12) 0%, rgba(11,143,90,0.00) 70%)",
                  }}
                >
                  <div className="min-w-0">
                    <div
                      className="text-[15px] font-extrabold tracking-tight"
                      style={{ color: "var(--income-ink, #0F172A)" }}
                    >
                      Хүргэлтийн постер
                    </div>

                    {/* Дээр байх ёстой анхааруулга — хэвээр */}
                    <div className="mt-1 text-[12px] font-semibold text-slate-600">
                      Та хүргүүлэх саналаа татаж аваад хүссэн групп/пэйж рүүгээ пост
                      хийгээрэй.
                    </div>
                  </div>
                </div>

                {/* body */}
                <div className="px-5 pt-4 pb-5">
                  <div
                    ref={outerRef}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50"
                    style={{ height: "min(62vh, 640px)" }}
                  >
                    <div className="w-full h-full flex items-center justify-center p-3">
                      <div ref={posterMeasureRef} className="w-[1080px] h-[1080px]">
                        <div
                          style={{
                            transform: `scale(${scale})`,
                            transformOrigin: "center",
                          }}
                        >
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

                  <div className="mt-3 text-[12px] font-semibold text-slate-500">
                    * Газрын зураг бүрэн ачаалсны дараа PNG илүү цэвэр гарна.
                  </div>

                  <button
                    type="button"
                    onClick={downloadPoster}
                    disabled={busy}
                    className="mt-4 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {busy ? "Бэлтгэж байна…" : "PNG татах"}
                  </button>

                  {/* ✅ ШИНЭ: “Гарах” товч (Хаах-ыг бүр авсан) */}
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      close();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      close();
                    }}
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 hover:border-slate-300"
                  >
                    Гарах
                  </button>
                </div>
              </div>
              {/* end modal card */}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
