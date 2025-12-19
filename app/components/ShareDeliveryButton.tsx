"use client";

import { useState } from "react";
import {
  ShareDeliveryPayload,
  buildShareText,
  copyToClipboard,
  getPublicShareUrl,
  openFacebookShare,
} from "@/lib/shareDelivery";

export default function ShareDeliveryButton({
  payload,
  className,
  onToast,
}: {
  payload: ShareDeliveryPayload;
  className?: string;
  onToast?: (msg: string) => void; // хүсвэл seller page дээрээ msg set хийхэд
}) {
  const [busy, setBusy] = useState(false);

  async function onShare() {
    if (busy) return;
    setBusy(true);

    try {
      // ✅ 1) public URL (FB дээр гоё card болгох суурь)
      const publicUrl = getPublicShareUrl(payload.id);

      // ✅ 2) текстийг хуулж өгнө (хүсвэл FB дээр paste хийхэд бэлэн)
      const text = buildShareText(payload);
      const ok = await copyToClipboard(text);
      onToast?.(ok ? "📤 SHARE текст хууллаа." : "Clipboard зөвшөөрөлгүй байна.");

      // ✅ 3) FB share dialog нээнэ (URL-ээр)
      openFacebookShare(publicUrl);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      disabled={busy}
      className={
        className ||
        "rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      }
      title="SHARE"
    >
      {busy ? "…" : "📤 SHARE"}
    </button>
  );
}
