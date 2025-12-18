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
  | "PAID" // legacy/status-level only (UI таб байхгүй)
  | "DISPUTE" // legacy/status-level only (UI таб байхгүй)
  | "CLOSED" // legacy/status-level only (UI таб байхгүй)
  | "CANCELLED"; // legacy only

// ---------- SELLER TABS (UI) ----------
export type SellerTabId = "OPEN" | "ASSIGNED" | "ON_ROUTE" | "DELIVERED";

export const SELLER_TABS: { id: SellerTabId; label: string }[] = [
  { id: "OPEN", label: "Нээлттэй" },
  { id: "ASSIGNED", label: "Жолооч сонгосон" },
  { id: "ON_ROUTE", label: "Замд" },
  { id: "DELIVERED", label: "Хүргэсэн" },
];

// ---------- DRIVER TABS (UI) ----------
export type DriverTabId =
  | "OPEN"
  | "REQUESTS" // OPEN + myBid
  | "ASSIGNED"
  | "ON_ROUTE"
  | "DELIVERED";

export const DRIVER_TABS: { id: DriverTabId; label: string }[] = [
  { id: "OPEN", label: "Нээлттэй" },
  { id: "REQUESTS", label: "Хүсэлт" },
  { id: "ASSIGNED", label: "Намайг сонгосон" },
  { id: "ON_ROUTE", label: "Замд" },
  { id: "DELIVERED", label: "Хүргэсэн" },
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

// REQUESTS энд орохгүй (UI дээр OPEN + myBid-аар салгана)
export function getDriverTabForStatus(
  status: DeliveryStatus
): Exclude<DriverTabId, "REQUESTS"> {
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

// ---------- HELPERS ----------
function hasTs(v: any): boolean {
  return !!v;
}
function bool(v: any): boolean {
  return !!v;
}

// ---------- PERMISSIONS ----------

// ASSIGNED → ON_ROUTE
export function canDriverMarkOnRoute(input: {
  status: DeliveryStatus;
  picked_up_at?: string | null;
  chosen_driver_id?: string | null;
  me_driver_id?: string;
}): boolean {
  if (isClosedStatus(input.status)) return false;

  const isMine =
    !input.me_driver_id || !input.chosen_driver_id
      ? true
      : input.chosen_driver_id === input.me_driver_id;

  if (!isMine) return false;
  if (input.status !== "ASSIGNED") return false;
  if (hasTs(input.picked_up_at)) return false;

  return true;
}

// ON_ROUTE → DELIVERED
export function canDriverMarkDelivered(input: {
  status: DeliveryStatus;
  delivered_at?: string | null;
  chosen_driver_id?: string | null;
  me_driver_id?: string;
}): boolean {
  if (isClosedStatus(input.status)) return false;

  const isMine =
    !input.me_driver_id || !input.chosen_driver_id
      ? true
      : input.chosen_driver_id === input.me_driver_id;

  if (!isMine) return false;
  if (input.status !== "ON_ROUTE") return false;
  if (hasTs(input.delivered_at)) return false;

  return true;
}

// DELIVERED → PAID (Seller) — legacy хэвээр үлдээнэ (UI товч байхгүй байж болно)
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

// PAID → CLOSED (Driver) — legacy хэвээр үлдээнэ (UI товч байхгүй байж болно)
export function canDriverConfirmPaymentReceived(input: {
  status: DeliveryStatus;
  driver_paid_confirmed_at?: string | null;
  driver_confirmed_payment?: boolean;
}): boolean {
  if (isClosedStatus(input.status)) return false;
  if (input.status !== "PAID") return false;

  if (input.driver_paid_confirmed_at !== undefined) {
    return !hasTs(input.driver_paid_confirmed_at);
  }
  return !bool(input.driver_confirmed_payment);
}

// 🔧 ALIAS (IMPORT ERROR-ИЙГ БҮРЭН ШИЙДНЭ)
// app/driver/page.tsx дээр `canDriverConfirmPayment` гэж ашиглаж байгаа тул
// яг энэ нэртэй export-ыг зориудаар гаргаж өгнө.
export function canDriverConfirmPayment(input: {
  status: DeliveryStatus;
  driver_confirmed_payment?: boolean;
}): boolean {
  return canDriverConfirmPaymentReceived({
    status: input.status,
    driver_confirmed_payment: input.driver_confirmed_payment,
  });
}

// ---------- DISPUTE (legacy хэвээр үлдээнэ) ----------
export function canOpenDispute(status: DeliveryStatus): boolean {
  if (isClosedStatus(status)) return false;
  return status === "ON_ROUTE" || status === "DELIVERED" || status === "PAID";
}

export function canResolveDispute(input: {
  status: DeliveryStatus;
  dispute_status?: "none" | "open" | "resolved" | string | null;
}): boolean {
  if (isClosedStatus(input.status)) return false;
  if (input.status !== "DISPUTE") return false;

  if (input.dispute_status !== undefined && input.dispute_status !== null) {
    return String(input.dispute_status) === "open";
  }
  return true;
}

// PAID дээр 2 тал баталгаажвал хаах эсэх (legacy)
export function shouldCloseDelivery(input: {
  status: DeliveryStatus;
  seller_marked_paid?: boolean;
  driver_confirmed_payment?: boolean;
  seller_paid_at?: string | null;
  driver_paid_confirmed_at?: string | null;
}): boolean {
  if (input.status !== "PAID") return false;

  if (
    input.seller_paid_at !== undefined &&
    input.driver_paid_confirmed_at !== undefined
  ) {
    return hasTs(input.seller_paid_at) && hasTs(input.driver_paid_confirmed_at);
  }
  return bool(input.seller_marked_paid) && bool(input.driver_confirmed_payment);
}
