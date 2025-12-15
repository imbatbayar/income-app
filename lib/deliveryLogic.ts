// ===================== lib/deliveryLogic.ts (FINAL v2) =====================
// Хүргэлтийн статус, табуудын төвлөрсөн логик
// - PAID статус / таб ашиглахгүй
// - Төлбөрийн тохироо: DELIVERED дээр seller_marked_paid + driver_confirmed_payment хоёулаа true бол CLOSED болно.
// - Driver талд "REQUESTS" таб = status биш, UI дээр "myBid байгаа OPEN" гэж салгаж үзүүлнэ.

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
  { id: "CLOSED", label: "Хаагдсан" },
  { id: "DISPUTE", label: "Маргаан" }, // ✅ хамгийн сүүлд
];

// ---------- DRIVER TABS ----------

export type DriverTabId =
  | "OPEN"
  | "REQUESTS" // ✅ шинэ таб (миний хүсэлтүүд)
  | "ASSIGNED"
  | "ON_ROUTE"
  | "DELIVERED"
  | "CLOSED"
  | "DISPUTE";

export const DRIVER_TABS: { id: DriverTabId; label: string }[] = [
  { id: "OPEN", label: "Нээлттэй" },
  { id: "REQUESTS", label: "Хүсэлт" }, // ✅ OPEN дээрх "миний хүсэлттэй" хүргэлтүүд
  { id: "ASSIGNED", label: "Намайг сонгосон" },
  { id: "ON_ROUTE", label: "Замд" },
  { id: "DELIVERED", label: "Хүргэсэн" },
  { id: "CLOSED", label: "Хаагдсан" },
  { id: "DISPUTE", label: "Маргаан" }, // ✅ хамгийн сүүлд
];

// ---------- ТУСЛАХ ----------

// Статусыг монголоор
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

// Хаалттай ангилал
export function isClosedStatus(status: DeliveryStatus): boolean {
  return status === "CLOSED" || status === "CANCELLED";
}

// Status → SellerTab
export function getSellerTabForStatus(status: DeliveryStatus): SellerTabId {
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
  }
}

// Status → DriverTab (⚠️ REQUESTS энд орохгүй. REQUESTS бол UI дээр myBid-тэй OPEN-оор салгана)
export function getDriverTabForStatus(status: DeliveryStatus): Exclude<DriverTabId, "REQUESTS"> {
  switch (status) {
    case "OPEN":
      return "OPEN";
    case "ASSIGNED":
      return "ASSIGNED";
    case "ON_ROUTE":
      return "ON_ROUTE";
    case "DELIVERED":
      return "DELIVERED";
    case "CLOSED":
    case "CANCELLED":
      return "CLOSED";
    case "DISPUTE":
      return "DISPUTE";
  }
}

// CLOSED болох ёстой эсэх (товч нэг газар)
// ✅ зөвхөн DELIVERED дээр 2 талын төлбөр батлагдвал хаагдана
export function shouldCloseDelivery(input: {
  status: DeliveryStatus;
  seller_marked_paid: boolean;
  driver_confirmed_payment: boolean;
}): boolean {
  return (
    input.status === "DELIVERED" &&
    !!input.seller_marked_paid &&
    !!input.driver_confirmed_payment
  );
}

// ---------- Маргаан нээх боломж ----------
// ✅ Жолооч тал: ON_ROUTE эсвэл DELIVERED үед
export function canOpenDisputeForDriver(status: DeliveryStatus): boolean {
  return status === "ON_ROUTE" || status === "DELIVERED";
}

// ✅ Худалдагч тал: ON_ROUTE эсвэл DELIVERED үед (шаардлагатай бол ашиглана)
export function canOpenDisputeForSeller(status: DeliveryStatus): boolean {
  return status === "ON_ROUTE" || status === "DELIVERED";
}
