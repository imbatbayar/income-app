"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import HamburgerMenu from "./HamburgerMenu";

type Role = "seller" | "driver" | "";

function pickUserFromLocalStorage(): { name: string; role: Role } {
  const keys = ["incomeUser", "user", "authUser"];
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    if (!raw) continue;

    try {
      const u = JSON.parse(raw);
      const name =
        u?.name ||
        u?.full_name ||
        u?.displayName ||
        u?.username ||
        u?.phone ||
        u?.email ||
        "";

      const role = (u?.role || "") as Role;
      if (String(name).trim()) return { name: String(name).trim(), role };
    } catch {
      if (raw.trim()) return { name: raw.trim(), role: "" };
    }
  }

  return { name: "", role: "" };
}

export default function TahiHeader() {
  const pathnameRaw = usePathname() || "/";

  const pathname = useMemo(() => {
    const p = pathnameRaw.replace(/\/+$/, "") || "/";
    return p;
  }, [pathnameRaw]);

  // ✅ hooks-үүдийг ALWAYS дуудна (Rules of Hooks)
  const [userName, setUserName] = useState("");
  const [role, setRole] = useState<Role>("");

  useEffect(() => {
    // localStorage зөвхөн client дээр ажиллана
    const u = pickUserFromLocalStorage();
    setUserName(u.name);
    setRole(u.role);
  }, []);
  
    useEffect(() => {
    const h = pathname === "/" || pathname === "/register" ? "0px" : "64px";
    document.documentElement.style.setProperty("--tahi-header-h", h);
  }, [pathname]);

  // ✅ Login/Register дээр header огт гарахгүй (hooks-ийн ДАРАА return хийх ёстой)
  if (pathname === "/" || pathname === "/register") return null;

  // ✅ role localStorage дээр хоосон бол route-аас таамаглана (товч алга болохоос хамгаална)
  const isDriver = role === "driver" || pathname.startsWith("/driver");
  const isSeller = role === "seller" || pathname.startsWith("/seller");

  const menuItems = [{ label: "Account", href: "/account" }];

  if (isDriver) menuItems.unshift({ label: "Профайл", href: "/driver/profile" });
  if (isSeller)
    menuItems.unshift({ label: "Шинэ хүргэлт", href: "/seller/new-delivery" });

  return (
    <div className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="h-16 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/tahi.png"
            alt="TAHI"
            className="h-10 w-10 rounded-xl border border-slate-200 bg-white object-contain"
          />
          <div className="min-w-0">
            <div className="text-sm font-black text-slate-900 leading-tight truncate">
              Tahi - Smart Delivery System
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {userName ? (
            <div className="max-w-[220px] truncate text-sm font-extrabold text-slate-800">
              {userName}
            </div>
          ) : (
            <div className="max-w-[220px] truncate text-sm font-extrabold text-slate-500" />
          )}

          <HamburgerMenu items={menuItems} />
        </div>
      </div>
    </div>
  );
}
