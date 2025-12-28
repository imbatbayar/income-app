import { redirect } from "next/navigation";

// Seller үндсэн route — status тус бүрийн тусдаа хуудсууд руу чиглүүлнэ.
// Auth шалгалтыг /seller/open доторх dashboard component өөрөө хийнэ.
export default function SellerRoot() {
  redirect("/seller/open");
}
