// lib/deliveryLogic.ts
// ХҮРГЭЛТИЙН СТАТУС + МАРГААН + ХААЛТЫН ЭНГИЙН ТАРХИ (RETURNED устсан)

// ==========================
// 1) СТАТУС ENUM
// ==========================

export type DeliveryStatus =
  | "OPEN"        // Нээлттэй — жолооч нар санал өгөх боломжтой
  | "ASSIGNED"    // Худалдагч жолооч сонгосон
  | "ON_ROUTE"    // (хуучин PICKED_UP) Жолооч замд гарсан
  | "DELIVERED"   // Жолооч хүргэсэн гэж дарсан
  | "DISPUTE"     // Маргаан нээгдсэн
  | "PAID"        // Худалдагч хүргэсэн барааны төлбөр баталгаажуулсан
  | "CLOSED"      // Систем / талуудын шийдвэрээр бүрэн хаагдсан
  | "CANCELLED";  // Захиалга эхлэхээс өмнө цуцлагдсан

// ==========================
// 2) МАРГААНЫН ТӨРЛҮҮД
// ==========================

export type DisputeReason =
  | "NOT_DELIVERED_BUT_MARKED" // Жолооч хүргээгүй мөртлөө хүргэсэн гэж дарсан
  | "SELLER_NOT_PAYING"        // Худалдагч төлбөрөө өгөхгүй байгаа
  | "ADDRESS_PROBLEM"          // Хаяг буруу, олон дахин асуудалтай
  | "NO_CONTACT"               // Холбогдох боломжгүй
  | "OTHER";                   // Бусад шалтгаан

// ==========================
// 3) SELLER ТАБ (ШИНЭЛСЭН STRUCTURE)
// ==========================

export const SELLER_TABS: { id: DeliveryStatus; label: string }[] = [
  { id: "OPEN",       label: "Нээлттэй" },
  { id: "ASSIGNED",   label: "Сонгосон" },
  { id: "ON_ROUTE",   label: "Замд" },
  { id: "DELIVERED",  label: "Хүргэсэн" },
  { id: "PAID",       label: "Төлбөр" },
  { id: "DISPUTE",    label: "Маргаан" },
  { id: "CLOSED",     label: "Хаагдсан" },
];

// Буцаалт (RETURNED) ТАБ УСТСАН → БАЙХГҮЙ

export function isDisputeTabItem(status: DeliveryStatus): boolean {
  return status === "DISPUTE";
}

export function isClosedTabItem(status: DeliveryStatus): boolean {
  return status === "CLOSED";
}

// ==========================
// 4) МАРГААН НЭЭХ БОЛОМЖ
// ==========================

// Худалдагч маргаан нээж болох үе:
// - DELIVERED  → хүргэсэн гэж дарсан ч үнэндээ хүргээгүй бол
// - ON_ROUTE   → жолооч алга болсон, хаяг буруу гэх мэт
// - PAID биш болохоор маргаан нээгдэж болно
export function canOpenDisputeForSeller(status: DeliveryStatus): boolean {
  return status === "DELIVERED" || status === "ON_ROUTE";
}

// Жолооч маргаан нээж болох үе:
// - ON_ROUTE → хаяг байнга буруу, худалдагч утсаа авахгүй, төлбөр өгөхгүй
// - DELIVERED → хүргэсэн ч төлбөр баталгаажуулахгүй удаж байвал
export function canOpenDisputeForDriver(status: DeliveryStatus): boolean {
  return status === "ON_ROUTE" || status === "DELIVERED";
}

// ==========================
// 5) ТУСЛАХ ФУНКЦҮҮД
// ==========================

export function isClosedStatus(status: DeliveryStatus): boolean {
  return status === "CLOSED" || status === "CANCELLED";
}

// Хаагдсан захиалгыг дэлгэцээс нуух боломжтой учир,
// UI дээр зөвхөн seller_hidden / driver_hidden = false үед гарна.

// ==========================
// 6) ДАРААЛЛЫН ЛОГИК (STATUS FLOW)
// ==========================

// OPEN → ASSIGNED
export function nextAfterAssign(): DeliveryStatus {
  return "ASSIGNED";
}

// ASSIGNED → ON_ROUTE
export function nextAfterDriverStart(): DeliveryStatus {
  return "ON_ROUTE";
}

// ON_ROUTE → DELIVERED
export function nextAfterDelivered(): DeliveryStatus {
  return "DELIVERED";
}

// DELIVERED → PAID → CLOSED
export function nextAfterPaid(): DeliveryStatus {
  return "PAID";
}

export function nextAfterClose(): DeliveryStatus {
  return "CLOSED";
}
