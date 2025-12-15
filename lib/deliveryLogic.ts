// ===================== lib/deliveryLogic.ts =====================
// Хүргэлтийн статус, табуудын төвлөрсөн логик
// - PAID статус / табыг ашиглахгүй
// - Төлбөрийн тохироо нь DELIVERED + seller_marked_paid + driver_confirmed_payment
//   нөхцлөөр CLOSED рүү шилжинэ.

export type DeliveryStatus =
  | "OPEN"
  | "ASSIGNED"
  | "ON_ROUTE"
  | "DELIVERED"
  | "DISPUTE"
  | "CLOSED"
  | "CANCELLED";

// ---------- SELLER TABS ----------

export type SellerTabId =
  | "OPEN"
  | "ASSIGNED"
  | "ON_ROUTE"
  | "DELIVERED"
  | "DISPUTE"
  | "CLOSED";

export const SELLER_TABS: { id: SellerTabId; label: string }[] = [
  { id: "OPEN", label: "Нээлттэй" },
  { id: "ASSIGNED", label: "Жолооч сонгосон" },
  { id: "ON_ROUTE", label: "Замд" },
  { id: "DELIVERED", label: "Хүргэсэн" },
  { id: "DISPUTE", label: "Маргаан" },
  { id: "CLOSED", label: "Хаагдсан" },
];

// ---------- DRIVER TABS ----------

export type DriverTabId =
  | "OPEN"
  | "ASSIGNED"
  | "ON_ROUTE"
  | "DELIVERED"
  | "DISPUTE"
  | "CLOSED";

export const DRIVER_TABS: { id: DriverTabId; label: string }[] = [
  { id: "OPEN", label: "Нээлттэй" },
  { id: "ASSIGNED", label: "Над руу оноогдсон" },
  { id: "ON_ROUTE", label: "Замд" },
  { id: "DELIVERED", label: "Хүргэсэн" },
  { id: "DISPUTE", label: "Маргаан" },
  { id: "CLOSED", label: "Хаагдсан" },
];

// ---------- ТУСЛАХ ФУНКЦУУД ----------

// Статусыг монголоор уншигдах текст болгох
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

// Хаагдсан ангилалд ордог эсэх
export function isClosedStatus(status: DeliveryStatus): boolean {
  return status === "CLOSED" || status === "CANCELLED";
}

// Селлерийн табыг статус дээрээс таамаглах (хэрэгтэй бол ашиглаж болно)
export function getSellerTabForStatus(
  status: DeliveryStatus
): SellerTabId | null {
  switch (status) {
    case "OPEN":
      return "OPEN";
    case "ASSIGNED":
      return "ASSIGNED";
    case "ON_ROUTE":
      return "ON_ROUTE";
    case "DELIVERED":
      return "DELIVERED";
    case "DISPUTE":
      return "DISPUTE";
    case "CLOSED":
    case "CANCELLED":
      return "CLOSED";
    default:
      return null;
  }
}

// Жолоочийн табыг статус дээрээс таамаглах
export function getDriverTabForStatus(
  status: DeliveryStatus
): DriverTabId | null {
  switch (status) {
    case "OPEN":
      return "OPEN";
    case "ASSIGNED":
      return "ASSIGNED";
    case "ON_ROUTE":
      return "ON_ROUTE";
    case "DELIVERED":
      return "DELIVERED";
    case "DISPUTE":
      return "DISPUTE";
    case "CLOSED":
    case "CANCELLED":
      return "CLOSED";
    default:
      return null;
  }
}

// ---------- Маргаан нээх боломж (жолооч тал) ----------

export function canOpenDisputeForDriver(status: DeliveryStatus): boolean {
  // Жишээ логик: хүргэлт хийгдсэн (DELIVERED) үед жолооч маргаан нээж болно
  // Хэрвээ дараа нь нарийн болгоё гэвэл энд л өөрчлөнө.
  return status === "DELIVERED";
}
