"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const digitsOnly = (v: string) => v.replace(/\D/g, "");
const clamp = (v: string, n: number) => v.slice(0, n);

export default function LoginPage() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    setErr("");

    const pRaw = phone;
    const pinRaw = pin;

    const p = clamp(digitsOnly(pRaw), 8);
    const s = clamp(digitsOnly(pinRaw), 4);

    if (/[^0-9]/.test(pRaw)) return setErr("Утас зөвхөн тоо байна.");
    if (/[^0-9]/.test(pinRaw)) return setErr("PIN зөвхөн тоо байна.");
    if (p.length !== 8) return setErr("Утасны дугаар 8 оронтой тоо байна.");
    if (s.length !== 4) return setErr("PIN 4 оронтой тоо байна.");

    setLoading(true);

    const { data: user, error } = await supabase
      .from("users")
      .select("id, role, name, full_name, phone, pin")
      .eq("phone", p)
      .maybeSingle();

    setLoading(false);

    if (error) return setErr(error.message);
    if (!user) return setErr("Бүртгэл олдсонгүй. Эхлээд бүртгүүлнэ үү.");

    // ✅ PIN шалгалт (одоо байгаа логиктой нийцүүлэхийн тулд plain pin ашиглав)
    if (String(user.pin || "") !== s) return setErr("PIN буруу байна.");

    const displayName = user.full_name || user.name || p;

    localStorage.setItem(
      "incomeUser",
      JSON.stringify({ id: user.id, role: user.role, name: displayName, phone: p })
    );

    router.push(user.role === "driver" ? "/driver" : "/seller");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-[460px]">
        {/* Logo төвд */}
        <div className="text-center mb-6">
          <img
            src="/tahi.png"
            alt="TAHI"
            className="mx-auto h-20 w-20 rounded-2xl border border-slate-200 bg-white object-contain"
          />
          <div className="mt-4 text-2xl font-black text-slate-900">
            Tahi 
          </div>
          <div className="mt-1 text-sm text-slate-600">
            Smart Delivery System
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-extrabold text-slate-900">Нэвтрэх</div>

          <div className="mt-4">
            <label className="text-sm font-semibold text-slate-700">
              Утасны дугаар 
            </label>
            <div className="mt-2 flex items-center gap-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                +976
              </div>
              <input
                value={phone}
                onChange={(e) => setPhone(clamp(e.target.value, 8))}
                inputMode="numeric"
                maxLength={8}
                placeholder="88xxxxxx"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="text-sm font-semibold text-slate-700">
              Нууц үг (4 оронтой PIN)
            </label>
            <input
              value={pin}
              onChange={(e) => setPin(clamp(e.target.value, 4))}
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </div>

          {err && <div className="mt-3 text-sm font-semibold text-red-600">{err}</div>}

          <button
            onClick={onLogin}
            disabled={loading}
            className="mt-5 w-full rounded-xl bg-emerald-600 py-3 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? "Шалгаж байна…" : "Нэвтрэх"}
          </button>

          <div className="mt-4 text-center text-sm text-slate-600">
            Шинэ хэрэглэгч үү?{" "}
            <Link className="font-extrabold text-emerald-700" href="/register">
              Бүртгүүлэх
            </Link>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Hypatia Systems. All rights reserved.
        </div>
      </div>
    </div>
  );
}
