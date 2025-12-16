// ===================== lib/deliveryLogic.ts (FINAL v3) =====================
// Хүргэлтийн статус, табуудын төвлөрсөн логик
//
// ✅ Шинэ төлбөрийн урсгал (BABA-ийн дүрэм):
// 1) Driver "Хүргэсэн" дарснаар статус = DELIVERED → 2 талын "Хүргэсэн" таб руу орно
// 2) Seller "Төлбөр төлсөн" баталснаар статус = PAID → 2 талын "Төлсөн" таб руу орно
// 3) Driver "Төлбөр хүлээн авсан" баталснаар статус = CLOSED → 2 талын "Хаагдсан" таб руу орно
//
// ⚠️ Driver талд "REQUESTS" таб = status биш, UI дээр "myBid байгаа OPEN" гэж салгаж үзүүлнэ.

export type DeliveryStatus =
  | "OPEN"
  | "ASSIGNED"
  | "ON_ROUTE"
  | "DELIVERED"
  | "PAID"
  | "DISPUTE"
  | "CLOSED"
  | "CANCELLED";

// ---------- SELLER TABS ----------

export type SellerTabId =
  | "OPEN"
  | "ASSIGNED"
  | "ON_ROUTE"
  | "DELIVERED"
  | "PAID"
  | "DISPUTE"
  | "CLOSED";

export const SELLER_TABS: { id: SellerTabId; label: string }[] = [
  { id: "OPEN", label: "Нээлттэй" },
  { id: "ASSIGNED", label: "Жолооч сонгосон" },
  { id: "ON_ROUTE", label: "Замд" },
  { id: "DELIVERED", label: "Хүргэсэн" },
  { id: "PAID", label: "Төлсөн" },
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
  | "PAID"
  | "CLOSED"
  | "DISPUTE";

export const DRIVER_TABS: { id: DriverTabId; label: string }[] = [
  { id: "OPEN", label: "Нээлттэй" },
  { id: "REQUESTS", label: "Хүсэлт" }, // ✅ OPEN дээрх "миний хүсэлттэй" хүргэлтүүд
  { id: "ASSIGNED", label: "Намайг сонгосон" },
  { id: "ON_ROUTE", label: "Замд" },
  { id: "DELIVERED", label: "Хүргэсэн" },
  { id: "PAID", label: "Төлсөн" },
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
    case "PAID":
      return "PAID";
    case "DISPUTE":
      return "DISPUTE";
    case "CLOSED":
    case "CANCELLED":
      return "CLOSED";
  }
}

// Status → DriverTab
// (⚠️ REQUESTS энд орохгүй. REQUESTS бол UI дээр myBid-тэй OPEN-оор салгана)
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
      return "DELIVERED";
    case "PAID":
      return "PAID";
    case "CLOSED":
    case "CANCELLED":
      return "CLOSED";
    case "DISPUTE":
      return "DISPUTE";
  }
}

// ---------- ТӨЛБӨРИЙН ЛОГИК (төвлөрсөн) ----------
//
// UI дээрх товч идэвхтэй/идэвхгүй болох шалгуурыг энд төвлөрүүлнэ.
// Төлөв өөрчлөх (UPDATE) логик нь page.tsx/handler дээр байна.

export function canSellerMarkPaid(input: {
  status: DeliveryStatus;
  seller_marked_paid: boolean;
}): boolean {
  // ✅ Зөвхөн "Хүргэсэн" таб-д ирсэн (DELIVERED) үед идэвхтэй
  return input.status === "DELIVERED" && !input.seller_marked_paid;
}

export function canDriverConfirmPayment(input: {
  status: DeliveryStatus;
  driver_confirmed_payment: boolean;
}): boolean {
  // ✅ Зөвхөн "Төлсөн" (PAID) үед идэвхтэй
  return input.status === "PAID" && !input.driver_confirmed_payment;
}

// CLOSED болох ёстой эсэх (товч нэг газар)
// ✅ зөвхөн PAID дээр driver_confirmed_payment батлагдвал хаагдана
export function shouldCloseDelivery(input: {
  status: DeliveryStatus;
  seller_marked_paid: boolean;
  driver_confirmed_payment: boolean;
}): boolean {
  return (
    input.status === "PAID" &&
    !!input.seller_marked_paid &&
    !!input.driver_confirmed_payment
  );
}

// ---------- Маргаан нээх боломж ----------
// ✅ Жолооч тал: ON_ROUTE / DELIVERED / PAID үед (хаагдахаас өмнө)
export function canOpenDisputeForDriver(status: DeliveryStatus): boolean {
  return status === "ON_ROUTE" || status === "DELIVERED" || status === "PAID";
}

// ✅ Худалдагч тал: ON_ROUTE / DELIVERED / PAID үед (хаагдахаас өмнө)
export function canOpenDisputeForSeller(status: DeliveryStatus): boolean {
  return status === "ON_ROUTE" || status === "DELIVERED" || status === "PAID";
}
