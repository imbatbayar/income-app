// ===================== lib/deliveryLogic.ts (FINAL v5.0) =====================
// Хүргэлтийн статус, табуудын төвлөрсөн логик (single source of truth)
//
// ✅ BABA UI rule:
// - Seller/Driver талд: Төлсөн / Хаагдсан / Маргаан таб байхгүй.
// - Legacy статусууд (PAID/CLOSED/DISPUTE/CANCELLED) байвал UI дээр "Хүргэсэн" таб руу НЭГТГЭНЭ.
//
// ✅ Core flow (one-way, rollback байхгүй):
// OPEN -> ASSIGNED -> ON_ROUTE -> DELIVERED
//
// ✅ Compatibility (legacy талбарууд):
// - boolean талбарууд: seller_marked_paid, driver_confirmed_payment
// - timestamp талбарууд: delivered_at, seller_paid_at, driver_paid_confirmed_at
// → 2-г нь зэрэг дэмжинэ (хуучин өгөг устахгүй)

// ---------- STATUS ----------
export type DeliveryStatus =
  | "OPEN"
  | "ASSIGNED"
  | "ON_ROUTE"
  | "DELIVERED"
  | "PAID"
  | "DISPUTE"
  | "CLOSED"
  | "CANCELLED";

export type SellerTabId = "OPEN" | "ASSIGNED" | "ON_ROUTE" | "DELIVERED";

// ---------- LABELS ----------
export function sellerTabLabel(id: SellerTabId) {
  switch (id) {
    case "OPEN":
      return "Нээлттэй";
    case "ASSIGNED":
      return "Жолооч сонгосон";
    case "ON_ROUTE":
      return "Замд";
    case "DELIVERED":
    default:
      return "Хүргэсэн";
  }
}

// ---------- CLOSED ----------
export function isClosedStatus(status: DeliveryStatus): boolean {
  // ❗ Жинхэнэ хаалт бол CLOSED. CANCELLED бол legacy.
  return status === "CLOSED" || status === "CANCELLED";
}

// ---------- STATUS -> TAB (UI MAPPING) ----------
export function getSellerTabForStatus(status: DeliveryStatus): SellerTabId {
  switch (status) {
    case "OPEN":
      return "OPEN";
    case "ASSIGNED":
      return "ASSIGNED";
    case "ON_ROUTE":
      return "ON_ROUTE";
    case "DELIVERED":
    case "PAID":
    case "DISPUTE":
    case "CLOSED":
    case "CANCELLED":
    default:
      // ✅ БҮХ legacy статусуудыг DELIVERED таб дээр нэгтгэнэ
      return "DELIVERED";
  }
}

// ---------- DRIVER TABS (UI) ----------
export type DriverTabId =
  | "OFFERS" // 📦 Санал
  | "PICKUP" // 📥 Ирж аваарай
  | "IN_TRANSIT" // 📤 Хүргэлт эхэлсэн
  | "DONE"; // 🎉 Хүргэчихлээ

export const DRIVER_TABS: { id: DriverTabId; label: string }[] = [
  { id: "OFFERS", label: "📦 Санал" },
  { id: "PICKUP", label: "📥 Ирж аваарай" },
  { id: "IN_TRANSIT", label: "📤 Хүргэлт эхэлсэн" },
  { id: "DONE", label: "🎉 Хүргэчихлээ" },
];

// ---------- LABELS ----------
export function statusLabel(status: DeliveryStatus): string {
  switch (status) {
    case "OPEN":
      return "Нээлттэй";
    case "ASSIGNED":
      return "Жолооч сонгосон";
    case "ON_ROUTE":
      return "Замд";
    case "DELIVERED":
      return "Хүргэсэн";
    case "PAID":
      return "Төлсөн";
    case "DISPUTE":
      return "Маргаан";
    case "CLOSED":
      return "Хаагдсан";
    case "CANCELLED":
      return "Цуцалсан";
    default:
      return status;
  }
}

// ---------- HELPERS ----------
function bool(v: any): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}
function hasTs(v: string | null | undefined): boolean {
  if (!v) return false;
  const s = String(v).trim();
  return s.length > 0 && s !== "null" && s !== "undefined";
}

// ---------- DRIVER TAB (status -> driverTab) ----------
export function getDriverTabForStatus(status: DeliveryStatus): DriverTabId {
  switch (status) {
    case "OPEN":
      return "OFFERS";
    case "ASSIGNED":
      return "PICKUP";
    case "ON_ROUTE":
      return "IN_TRANSIT";
    case "DELIVERED":
    case "PAID":
    case "DISPUTE":
    case "CLOSED":
    case "CANCELLED":
    default:
      // ✅ БҮХ legacy статусуудыг DONE таб дээр нэгтгэнэ
      return "DONE";
  }
}

// ---------- Seller mark paid (legacy support) ----------
export function canSellerMarkPaid(input: {
  status: DeliveryStatus;
  seller_paid_at?: string | null;
  seller_marked_paid?: boolean;
}): boolean {
  if (isClosedStatus(input.status)) return false;
  if (input.status !== "DELIVERED") return false;

  if (input.seller_paid_at !== undefined) {
    return !hasTs(input.seller_paid_at);
  }
  return !bool(input.seller_marked_paid);
}

export function normalizePaidFields(input: {
  seller_paid_at?: string | null;
  seller_marked_paid?: boolean;
}): boolean {
  // аль нэг нь true байвал “seller paid” гэж үзнэ
  if (input.seller_paid_at !== undefined) return hasTs(input.seller_paid_at);
  return bool(input.seller_marked_paid);
}

// ---------- Driver confirm payment (legacy support) ----------
export function canDriverConfirmPayment(input: {
  status: DeliveryStatus;
  driver_paid_confirmed_at?: string | null;
  driver_confirmed_payment?: boolean;
}): boolean {
  if (isClosedStatus(input.status)) return false;
  if (input.status !== "DELIVERED") return false;

  if (input.driver_paid_confirmed_at !== undefined) {
    return !hasTs(input.driver_paid_confirmed_at);
  }
  return !bool(input.driver_confirmed_payment);
}

export function normalizeDriverPaidFields(input: {
  driver_paid_confirmed_at?: string | null;
  driver_confirmed_payment?: boolean;
}): boolean {
  if (input.driver_paid_confirmed_at !== undefined)
    return hasTs(input.driver_paid_confirmed_at);
  return bool(input.driver_confirmed_payment);
}

// ---------- SELLER TABS (UI) ----------
export const SELLER_TABS: { id: SellerTabId; label: string }[] = [
  { id: "OPEN", label: "Нээлттэй" },
  { id: "ASSIGNED", label: "Жолооч сонгосон" },
  { id: "ON_ROUTE", label: "Замд" },
  { id: "DELIVERED", label: "Хүргэсэн" },
];
