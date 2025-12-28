// lib/deliveries.ts
// Seller/Driver талд ашиглах deliveries хүснэгтийн Row төрлүүдийг төвлөрүүлсэн.
// ✅ UI-д хэрэгтэй багануудыг л тодорхойлсон.

import type { DeliveryStatus } from "@/lib/deliveryLogic";

// ---------------- Seller dashboard ----------------
export type DeliveryRowSeller = {
  id: string;
  seller_id: string;

  from_address: string | null;
  to_address: string | null;
  note: string | null;

  pickup_district: string | null;
  pickup_khoroo: string | null;
  dropoff_district: string | null;
  dropoff_khoroo: string | null;

  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;

  status: DeliveryStatus;
  created_at: string;
  price_mnt: number | null;
  delivery_type: string | null;
  chosen_driver_id: string | null;

  seller_hidden: boolean;

  // UI-д тооцож нэмдэг
  bid_count?: number;

  // замд гарсан мөч
  on_route_at?: string | null;
};

// ---------------- Driver dashboard ----------------
export type DeliveryRowDriver = {
  id: string;
  seller_id: string;

  from_address: string | null;
  to_address: string | null;
  note: string | null;

  pickup_district: string | null;
  pickup_khoroo: string | null;
  dropoff_district: string | null;
  dropoff_khoroo: string | null;

  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;

  status: DeliveryStatus;
  created_at: string;

  price_mnt: number | null;
  delivery_type: string | null;

  chosen_driver_id: string | null;

  // legacy төлбөрийн талбарууд
  seller_marked_paid: boolean;
  driver_confirmed_payment: boolean;

  dispute_opened_at: string | null;
  closed_at: string | null;

  driver_hidden: boolean;
};

export type BidLite = {
  id: string;
  driver_id: string;
  delivery_id: string;
  created_at: string;
};

export type SellerLite = {
  id: string;
  name: string | null;
  phone: string | null;
};
