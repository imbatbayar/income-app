"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import TahiHeader from "./TahiHeader";

export default function HeaderGate({ children }: { children: React.ReactNode }) {
  const raw = usePathname() || "/";
  const p = raw.replace(/\/+$/, "") || "/";

  // ✅ Зөвхөн Нэвтрэх дээр header байхгүй + padding байхгүй
  const isLogin = p === "/";

  // ✅ Login дээр scroll/overscroll/zoom gesture-ийг аль болох түгжих
  useEffect(() => {
    if (!isLogin) return;

    const html = document.documentElement;
    const body = document.body;

    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: (html.style as any).overscrollBehavior,
      bodyOverscroll: (body.style as any).overscrollBehavior,
      htmlTouch: (html.style as any).touchAction,
      bodyTouch: (body.style as any).touchAction,
    };

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    (html.style as any).overscrollBehavior = "none";
    (body.style as any).overscrollBehavior = "none";
    (html.style as any).touchAction = "manipulation";
    (body.style as any).touchAction = "manipulation";

    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      (html.style as any).overscrollBehavior = prev.htmlOverscroll;
      (body.style as any).overscrollBehavior = prev.bodyOverscroll;
      (html.style as any).touchAction = prev.htmlTouch;
      (body.style as any).touchAction = prev.bodyTouch;
    };
  }, [isLogin]);

  return (
    <>
      {/* Header өөрөө / дээр null буцаана. Гэхдээ эндээс бас хамгаалж байна */}
      {!isLogin && <TahiHeader />}

      {/* / дээр pt-16 хийхгүй => хоосон мөр алга */}
      <div className={isLogin ? "" : "pt-16"}>{children}</div>

      {/* (хэрвээ чи өмнө нь Seller floating товч нэмсэн бол энд хэвээр үлдээнэ) */}
    </>
  );
}
