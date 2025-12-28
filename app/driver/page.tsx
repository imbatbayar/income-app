import { redirect } from "next/navigation";

// Driver үндсэн route — status тус бүрийн тусдаа хуудсууд руу чиглүүлнэ.
// Auth шалгалтыг /driver/open доторх dashboard component өөрөө хийнэ.
export default function DriverRoot() {
  redirect("/driver/open");
}
