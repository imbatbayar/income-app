import type { DeliveryStatus } from "@/lib/deliveryLogic";
import type { DeliveryRowSeller } from "@/lib/deliveries";

export function fmtPrice(n: number | null | undefined) {
  const v = Number(n || 0);
  return v ? `${v.toLocaleString("mn-MN")}₮` : "Үнэ тохиролцоно";
}

export function shorten(s: string | null, max = 72) {
  if (!s) return "—";
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+$/, "") + "…";
}

export function areaLine(district?: string | null, khoroo?: string | null) {
  const d = (district || "").trim();
  const k = (khoroo || "").trim();

  if (d && k) return `${d} · ${k}`;
  if (d) return d;
  if (k) return k;
  return "—";
}

export function badge(status: DeliveryStatus) {
  switch (status) {
    case "OPEN":
      return {
        text: "Нээлттэй",
        cls: "border-emerald-200 bg-emerald-50/70 text-emerald-700",
      };
    case "ASSIGNED":
      return {
        text: "Сонгосон",
        cls: "border-indigo-200 bg-indigo-50 text-indigo-700",
      };
    case "ON_ROUTE":
      return {
        text: "Замд гарлаа",
        cls: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "PAID":
      return {
        text: "Төлсөн",
        cls: "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
    case "DELIVERED":
    default:
      return {
        text: "Хүргэсэн",
        cls: "border-slate-200 bg-slate-50 text-slate-700",
      };
  }
}

// ✅ hh:mm (амьд тоологдоно)
export function routeHHMM(onRouteAt?: string | null) {
  if (!onRouteAt) return "00:00";
  const t = new Date(onRouteAt).getTime();
  if (!Number.isFinite(t)) return "00:00";
  const ms = Date.now() - t;
  if (ms <= 0) return "00:00";

  const totalMin = Math.floor(ms / 60000);
  const hh = String(Math.floor(totalMin / 60)).padStart(2, "0");
  const mm = String(totalMin % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function routeTotalHours(onRouteAt?: string | null) {
  if (!onRouteAt) return 0;
  const t = new Date(onRouteAt).getTime();
  if (!Number.isFinite(t)) return 0;
  const ms = Date.now() - t;
  if (ms <= 0) return 0;
  return ms / 3600000;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function buildSharePostSimple(d: DeliveryRowSeller) {
  const fromArea = areaLine(d.pickup_district, d.pickup_khoroo);
  const toArea = areaLine(d.dropoff_district, d.dropoff_khoroo);
  const price = fmtPrice(d.price_mnt);
  const what = d.note ? d.note.trim() : "";
  return (
    `🚚 Delivery\n` +
    `📍 ${fromArea} → ${toArea}\n` +
    `💰 ${price}\n` +
    (what ? `📦 ${what}\n` : "") +
    `#INCOME`
  );
}
