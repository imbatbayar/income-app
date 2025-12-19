// lib/shareDelivery.ts
export type ShareDeliveryPayload = {
  id: string;
  from: string; // "Сүхбаатар 1 хороо"
  to: string; // "Баянзүрх 14 хороо"
  priceText: string; // "15,000₮" гэх мэт
  note?: string; // "2 хайрцаг цонхий" гэх мэт
};

export function buildShareText(p: ShareDeliveryPayload) {
  const lines = [
    "🚚 Хүргэлт хэрэгтэй байна",
    `📍 ${p.from} → ${p.to}`,
    `💰 ${p.priceText}`,
  ];
  if (p.note && p.note.trim()) lines.push(`📦 ${p.note.trim()}`);
  lines.push(`#INCOME-${p.id}`);
  return lines.join("\n");
}

export function getPublicShareUrl(deliveryId: string) {
  // ✅ FB crawler-д хамгийн чухал нь ABSOLUTE URL.
  // 1) NEXT_PUBLIC_SITE_URL (production custom domain) хамгийн түрүүнд
  // 2) NEXT_PUBLIC_VERCEL_URL (preview/prod auto domain) -> https://...
  // 3) client дээр window.origin
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  const vercel = (process.env.NEXT_PUBLIC_VERCEL_URL || "").trim();

  const base =
    site ||
    (vercel
      ? `https://${vercel}`
      : typeof window !== "undefined"
      ? window.location.origin
      : "");

  // SSR үед base хоосон байж болох тул relative fallback үлдээнэ
  if (!base) return `/share/delivery/${deliveryId}`;
  return `${base}/share/delivery/${deliveryId}`;
}

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function openFacebookShare(publicUrl: string) {
  const u = encodeURIComponent(publicUrl);
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${u}`, "_blank");
}
