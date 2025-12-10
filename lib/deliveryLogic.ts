// lib/deliveryLogic.ts
// ХҮРГЭЛТИЙН СТАТУС + БУЦААЛТ + МАРГААН ЛОГИКИЙН ТАРХИ

// -------- ТӨРЛҮҮД --------

export type DeliveryStatus =
  | "OPEN" // нээлттэй, жолооч авах хүсэлт гаргаж болно
  | "ASSIGNED" // нэг жолоочид оноосон
  | "PICKED_UP" // жолооч барааг авсан, замд
  | "DELIVERED" // барааг өгсөн (жолоочийн талаас)
  | "RETURNED" // барааг буцааж өгсөн (сэллэр рүү)
  | "PAID" // төлбөр шилжүүлэлт хийгдсэн, баталгаажиж байгаа үе
  | "CLOSED" // бүрэн хаагдсан
  | "DISPUTE" // маргаан нээсэн
  | "CANCELLED"; // хүргэлтийг цуцалсан (сэллэр / систем)

// Маргааны шалтгаанууд — одоогоор урьдчилсан enum, хүсвэл DB талдаа тааруулж өөрчилнө.
export type DisputeReason =
  | "NO_SHOW" // Цагтаа ирээгүй
  | "NO_CONTACT" // Холбогдох боломжгүй
  | "ADDRESS_WRONG" // Хаяг буруу / олдохгүй
  | "RECEIVER_REFUSED" // Хүлээн авагч авахгүй гэсэн
  | "DAMAGED" // Бараа гэмтсэн
  | "OTHER"; // Бусад

// -------- SELLER ТАЛЫН ТАБУУД --------

/**
 * Seller-ийн дэлгэц дээр харагдах табууд.
 * Маргааны табыг хамгийн ард байрлуулж байна.
 */
export const SELLER_TABS: { id: DeliveryStatus; label: string }[] = [
  { id: "OPEN",      label: "Нээлттэй" },
  { id: "ASSIGNED",  label: "Сонгосон" },
  { id: "PICKED_UP", label: "Замд" },
  { id: "DELIVERED", label: "Хүргэсэн" },
  { id: "RETURNED",  label: "Буцаалт" },
  { id: "PAID",      label: "Төлбөр" },
  { id: "CLOSED",    label: "Хаагдсан" },
  { id: "DISPUTE",   label: "Маргаан" }, // ✔ хамгийн сүүлд
];

/**
 * Маргааны таб дээр харуулах эсэх (seller тал).
 * Одоохондоо: status === "DISPUTE" бүх хүргэлт тэнд харагдана.
 */
export function isDisputeTabItem(status: DeliveryStatus): boolean {
  return status === "DISPUTE";
}

/**
 * Буцаалтын таб дээр харуулах эсэх (seller тал).
 * Одоохондоо: status === "RETURNED".
 */
export function isReturnTabItem(status: DeliveryStatus): boolean {
  return status === "RETURNED";
}

// -------- МАРГААН НЭЭХ БОЛОМЖ (seller тал) --------

/**
 * Seller маргаан нээж болох эсэх.
 * Одоогоор дараах статусуудаас маргаан нээж болно:
 * ASSIGNED, PICKED_UP, DELIVERED, RETURNED, PAID
 */
export function canOpenDisputeForSeller(status: DeliveryStatus): boolean {
  return (
    status === "ASSIGNED" ||
    status === "PICKED_UP" ||
    status === "DELIVERED" ||
    status === "RETURNED" ||
    status === "PAID"
  );
}

// -------- ЖОЛООЧИЙН БУЦААЛТЫН ЛОГИК --------

/**
 * Жолооч буцаах эсэх шийдвэр гаргах боломжтой үе.
 * Энгийн хувилбар: барааг аваад (PICKED_UP) хэрэглэгч авахгүй гэвэл
 * буцаах эсэхийг жолооч шийднэ.
 */
export function canDriverDecideReturn(status: DeliveryStatus): boolean {
  return status === "PICKED_UP";
}

/**
 * Жолооч буцаахыг хүлээн авбал статус яах вэ?
 * Одоогоор: шууд RETURNED болгоно.
 */
export function getStatusAfterDriverAcceptReturn(
  current: DeliveryStatus
): DeliveryStatus {
  // Одоогоор логикийг энгийн байлгаж, шууд RETURNED болгоно.
  return "RETURNED";
}

/**
 * Жолооч буцаахгүй, үргэлжлүүлж хүргэнэ гэж шийдсэн үед:
 * статус хэвээрээ үлдэнэ (ихэвчлэн PICKED_UP).
 */
export function getStatusAfterDriverRejectReturn(
  current: DeliveryStatus
): DeliveryStatus {
  return current;
}
