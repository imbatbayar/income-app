// lib/types.ts
// Апп даяар ашиглах үндсэн төрлүүд

export type Role = "seller" | "driver";

export type IncomeUser = {
  id: string;
  role: Role;
  name: string;
  phone: string;
  email: string;
};
