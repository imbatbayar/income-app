// lib/shareDelivery.ts
export type ShareDeliveryPayload = {
  id: string;
  from: string;
  to: string;
  priceText: string;
  note?: string;
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

// ✅ Одоо public share url гэж байхгүй. Poster endpoint-оо л “share url” гэж ашиглана
export function getPublicShareUrl(deliveryId: string) {
  return `/api/fbpost/delivery/${encodeURIComponent(deliveryId)}`;
}

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ✅ Facebook share хийхгүй. (UI эвдрэхгүйн тул хадгалж үлдээв)
export function openFacebookShare(_publicUrl: string) {
  // no-op
}
