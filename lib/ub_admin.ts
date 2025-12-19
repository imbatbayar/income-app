// src/lib/ub_admin.ts
export type UBDistrictKey =
  | "Багахангай"
  | "Багануур"
  | "Баянгол"
  | "Баянзүрх"
  | "Чингэлтэй"
  | "Хан-Уул"
  | "Налайх"
  | "Сонгинохайрхан"
  | "Сүхбаатар";

export const UB_DISTRICTS: { key: UBDistrictKey; khorooCount: number }[] = [
  { key: "Багахангай", khorooCount: 2 },
  { key: "Багануур", khorooCount: 5 },
  { key: "Баянгол", khorooCount: 34 },
  { key: "Баянзүрх", khorooCount: 43 },
  { key: "Чингэлтэй", khorooCount: 24 },
  { key: "Хан-Уул", khorooCount: 25 },
  { key: "Налайх", khorooCount: 8 },
  { key: "Сонгинохайрхан", khorooCount: 43 },
  { key: "Сүхбаатар", khorooCount: 20 },
];

export function getDistrictOptions() {
  return UB_DISTRICTS.map((d) => ({ value: d.key, label: d.key }));
}

export function getKhorooOptions(district?: string) {
  const d = UB_DISTRICTS.find((x) => x.key === district);
  if (!d) return [];
  return Array.from({ length: d.khorooCount }, (_, i) => {
    const n = i + 1;
    return { value: String(n), label: `${n} хороо` };
  });
}
