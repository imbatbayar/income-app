"use client";

import { useEffect, useState } from "react";
import HamburgerMenu from "./HamburgerMenu";

function pickNameFromLocalStorage(): string {
  const keys = ["incomeUser", "user", "authUser"];
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    if (!raw) continue;

    // JSON байж магадгүй
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
      if (String(name).trim()) return String(name).trim();
    } catch {
      // text байж магадгүй
      if (raw.trim()) return raw.trim();
    }
  }
  return "";
}

export default function TahiHeader() {
  const [userName, setUserName] = useState("");

  useEffect(() => {
    setUserName(pickNameFromLocalStorage());
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="h-16 px-4 flex items-center justify-between">
        {/* Left: Logo + Title */}
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

        {/* Right: Username + Hamburger */}
        <div className="flex items-center gap-3">
          {userName ? (
            <div className="max-w-[220px] truncate text-sm font-extrabold text-slate-800">
              {userName}
            </div>
          ) : (
            <div className="max-w-[220px] truncate text-sm font-extrabold text-slate-500">
              {/* Нэр олдохгүй үед хоосон байлгах боломжтой */}
            </div>
          )}

          <HamburgerMenu items={[{ label: "Account", href: "/account" }]} />
        </div>
      </div>
    </div>
  );
}
