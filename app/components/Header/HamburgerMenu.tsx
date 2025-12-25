"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type MenuItem = { label: string; href: string };

function doLogout() {
  try {
    // Танай төслийн гол ашигладаг түлхүүрүүд
    localStorage.removeItem("incomeUser");
    localStorage.removeItem("user");
    localStorage.removeItem("authUser");

    // нэмэлтээр байж болох зарим түлхүүрүүд (байхгүй бол зүгээр)
    localStorage.removeItem("incomeRole");
    localStorage.removeItem("role");
    localStorage.removeItem("session");
  } catch {
    // ignore
  }

  // хамгийн энгийн, найдвартай redirect
  window.location.href = "/";
}

export default function HamburgerMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!open) return;
      const t = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(t)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Menu"
        onClick={() => setOpen(true)}
        className="h-10 w-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:scale-[0.99] grid place-items-center"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/30" />

          <div
            ref={panelRef}
            className="absolute right-3 top-3 w-[280px] rounded-2xl bg-white shadow-lg border border-slate-200 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="text-sm font-extrabold text-slate-900">Menu</div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="h-9 w-9 rounded-xl hover:bg-slate-100 grid place-items-center"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Top items */}
            <div className="p-2">
              {items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-3 py-3 text-sm font-extrabold text-slate-900 hover:bg-slate-50"
                >
                  {it.label}
                </Link>
              ))}
            </div>

            {/* Bottom: Logout */}
            <div className="border-t border-slate-100 p-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  doLogout();
                }}
                className="w-full rounded-xl px-3 py-3 text-sm font-extrabold text-red-700 hover:bg-red-50 text-left"
              >
                Гарах
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
