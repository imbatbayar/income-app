"use client";

import { useEffect, useMemo, useState } from "react";
import { ShareDeliveryPayload, getPublicShareUrl } from "@/lib/shareDelivery";

export default function ShareDeliveryButton({
  payload,
  className,
  onToast,
}: {
  payload: ShareDeliveryPayload;
  className?: string;
  onToast?: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  const posterEndpoint = useMemo(() => getPublicShareUrl(payload.id), [payload.id]);

  // modal нээгдэхэд постерийг авч preview болгоно
  useEffect(() => {
    if (!open) return;

    let alive = true;
    let objectUrl: string | null = null;

    (async () => {
      setBusy(true);
      setErr(null);
      setImgUrl(null);

      try {
        const res = await fetch(posterEndpoint, { method: "GET" });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(`Постер бэлдэхэд алдаа (${res.status}) ${t}`.trim());
        }
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (alive) setImgUrl(objectUrl);
      } catch (e: any) {
        if (alive) {
          setErr(e?.message || "Алдаа гарлаа");
          onToast?.(e?.message || "Алдаа гарлаа");
        }
      } finally {
        if (alive) setBusy(false);
      }
    })();

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, posterEndpoint, onToast]);

  function onClickPoster() {
    setOpen(true);
  }

  function download() {
    if (!imgUrl) return;
    const safeId = String(payload.id).replace(/[^a-zA-Z0-9_-]/g, "_");
    const a = document.createElement("a");
    a.href = imgUrl;
    a.download = `INCOME_POSTER_${safeId}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <>
      <button
        type="button"
        onClick={onClickPoster}
        disabled={busy}
        className={
          className ||
          "rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:border-slate-300 disabled:opacity-60"
        }
        title="Постер"
      >
        {busy ? "…" : "💾 Photo"}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[560px] rounded-2xl bg-white shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-bold text-slate-900">Постер preview</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm font-bold text-slate-900 hover:border-slate-300"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              <div className="aspect-square w-full overflow-hidden rounded-xl border bg-slate-50 flex items-center justify-center">
                {busy ? (
                  <div className="text-slate-600 text-sm">Бэлдэж байна…</div>
                ) : err ? (
                  <div className="text-red-600 text-sm p-3 text-center">{err}</div>
                ) : imgUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgUrl} alt="Poster" className="h-full w-full object-cover" />
                ) : (
                  <div className="text-slate-600 text-sm">—</div>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={download}
                  disabled={!imgUrl || busy}
                  className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  💾 Зураг татах
                </button>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:border-slate-300"
                >
                  Хаах
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
