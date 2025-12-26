"use client";

import React from "react";
import { usePathname } from "next/navigation";
import TahiHeader from "./TahiHeader";

/**
 * - Нэвтрэх (/), Бүртгүүлэх (/register) дээр header-ийг харуулахгүй
 * - Бусад бүх хуудсан дээр header + pt-16 padding хэвээр
 */
export default function HeaderGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const hideHeader = pathname === "/" || pathname === "/register";

  return (
    <>
      {!hideHeader && <TahiHeader />}
      <div className={hideHeader ? "" : "pt-16"}>{children}</div>
    </>
  );
}
