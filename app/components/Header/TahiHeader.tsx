"use client";

import { useEffect, useState } from "react";
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
  const [userName, setUserName] = useState("");
  const [role, setRole] = useState<Role>("");

  useEffect(() => {
    const u = pickUserFromLocalStorage();
    setUserName(u.name);
    setRole(u.role);
  }, []);

  const menuItems = [{ label: "Account", href: "/account" }];
  if (role === "driver") menuItems.unshift({ label: "Профайл", href: "/driver/profile" });
  if (role === "seller") menuItems.unshift({ label: "Шинэ хүргэлт", href: "/seller/new-delivery" });

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
              Tahi - Smart Delivery &amp; Pickup
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {userName ? (
            <div className="max-w-[220px] truncate text-sm font-extrabold text-slate-800">
              {userName}
            </div>
          ) : (
            <div className="max-w-[220px] truncate text-sm font-extrabold text-slate-500"></div>
          )}

          <HamburgerMenu items={menuItems} />
        </div>
      </div>
    </div>
  );
}
