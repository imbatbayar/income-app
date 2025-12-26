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

// ✅ 4 тоо (машины дугаарын тоон хэсэг)
const onlyDigitsN = (v: string, n: number) => v.replace(/\D/g, "").slice(0, n);

// ✅ 3 кирилл (Монгол үсэг) — латин/тоо оруулахгүй
const onlyCyrillicN = (v: string, n: number) =>
  v.replace(/[^А-ЯЁӨҮа-яёөү]/g, "").slice(0, n);

type Role = "driver" | "seller";

// ✅ SMS provider байхгүй үед DEV тест хийх (localhost / *.vercel.app дээр л зөвшөөрнө)
function allowDevOtp() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname || "";
  return host === "localhost" || host.endsWith(".vercel.app");
}

export default function RegisterPage() {
  const router = useRouter();

  const [role, setRole] = useState<Role>("seller");

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");

  const [pin, setPin] = useState("");
  const [fullName, setFullName] = useState("");

  const [storeName, setStoreName] = useState(""); // seller optional

  // ✅ driver: 4 тоо + 3 кирилл тусдаа
  const [carNum, setCarNum] = useState(""); // 4 digits
  const [carSer, setCarSer] = useState(""); // 3 cyrillic letters

  const [step, setStep] = useState<"PHONE" | "OTP" | "SETUP">("PHONE");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ DEV OTP үед auth user байхгүй тул uid-г энд хадгална
  const [devUid, setDevUid] = useState<string>("");

  const sendOtp = async () => {
    setErr("");

    const pRaw = phone;
    const p = clamp(digitsOnly(pRaw), 8);

    if (/[^0-9]/.test(pRaw)) return setErr("Утас зөвхөн тоо байна.");
    if (p.length !== 8) return setErr("Утасны дугаар 8 оронтой тоо байна.");

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: `+976${p}` });
    setLoading(false);

    // ✅ Provider байхгүй үед DEV горим (123456) руу оруулна
    if (error) {
      if (allowDevOtp()) {
        setStep("OTP");
        setErr("DEV тест: SMS байхгүй. Код дээр 123456 гэж бичээд үргэлжлүүл.");
        return;
      }
      return setErr(error.message);
    }

    setStep("OTP");
  };

  const verifyOtp = async () => {
    setErr("");

    const p = clamp(digitsOnly(phone), 8);
    const codeRaw = otp;
    const code = clamp(digitsOnly(codeRaw), 6);

    if (p.length !== 8) return setErr("Утасны дугаар 8 оронтой тоо байна.");
    if (/[^0-9]/.test(codeRaw)) return setErr("Код зөвхөн тоо байна.");
    if (code.length < 4) return setErr("SMS кодоо оруулна уу.");

    // ✅ DEV shortcut: 123456
    if (allowDevOtp() && code === "123456") {
      // auth session байхгүй тул түр uid үүсгээд SETUP руу орно
      const uid =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `dev_${Date.now()}_${p}`;

      setDevUid(uid);
      setStep("SETUP");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({
      phone: `+976${p}`,
      token: code,
      type: "sms",
    });
    setLoading(false);

    if (error) return setErr(error.message);
    if (!data?.user?.id) return setErr("Баталгаажсан хэрэглэгч олдсонгүй.");

    setStep("SETUP");
  };

  const createAccount = async () => {
    setErr("");

    const pRaw = phone;
    const p = clamp(digitsOnly(pRaw), 8);

    const pinRaw = pin;
    const s = clamp(digitsOnly(pinRaw), 4);

    if (/[^0-9]/.test(pRaw)) return setErr("Утас зөвхөн тоо байна.");
    if (p.length !== 8) return setErr("Утасны дугаар 8 оронтой тоо байна.");

    if (/[^0-9]/.test(pinRaw)) return setErr("PIN зөвхөн тоо байна.");
    if (s.length !== 4) return setErr("PIN 4 оронтой тоо байна.");

    if (!String(fullName || "").trim()) return setErr("Овог нэр заавал.");

    // ✅ driver дугаар шалгалт: 4 тоо + 3 кирилл
    if (role === "driver") {
      if (carNum.length !== 4) return setErr("Машины дугаарын 4 тоог бүрэн оруул.");
      if (carSer.length !== 3) return setErr("Серийн 3 кирилл үсгийг бүрэн оруул.");
    }

    // ✅ uid-г шийднэ: жинхэнэ auth uid эсвэл devUid
    let uid = "";

    // DEV OTP бол devUid ашиглана
    if (devUid) {
      uid = devUid;
    } else {
      const { data: sess } = await supabase.auth.getUser();
      uid = sess?.user?.id || "";
    }

    if (!uid) {
      return setErr("SMS баталгаажуулалт дуусаагүй байна.");
    }

    setLoading(true);

    const carPlate =
      role === "driver" ? `${carNum}${carSer.toUpperCase()}` : null;

    // ✅ users хүснэгтэд бүртгэл үүсгэнэ
    // NOTE: users table дээр id/role/phone/pin/name/full_name/stars/store_name/car_plate байх ёстой.
    const payload: any = {
      id: uid,
      role,
      phone: p,
      pin: s,
      full_name: String(fullName).trim(),
      name: String(fullName).trim(),
      store_name: String(storeName || "").trim() || null,
      car_plate: carPlate,
      stars: 0,
    };

    const { error } = await supabase.from("users").upsert(payload);
    setLoading(false);

    if (error) return setErr(error.message);

    // ✅ LocalStorage auth (хуучин логик эвдэхгүй)
    localStorage.setItem(
      "incomeUser",
      JSON.stringify({
        id: uid,
        role,
        name: String(fullName).trim(),
        phone: p,
      })
    );

    // ✅ Supabase auth session-ийг үлдээхгүй (дараа нь PIN login л ашиглана)
    try {
      await supabase.auth.signOut();
    } catch {}

    router.push(role === "driver" ? "/driver" : "/seller");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-[520px]">
        <div className="text-center mb-6">
          <img
            src="/tahi.png"
            alt="TAHI"
            className="mx-auto h-20 w-20 rounded-2xl border border-slate-200 bg-white object-contain"
          />
          <div className="mt-4 text-2xl font-black text-slate-900">
            Tahi - Smart Delivery System
          </div>
          <div className="mt-1 text-sm text-slate-600">
            Бүртгүүлэх: 1 удаа SMS → 4 оронтой PIN үүсгэнэ
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-extrabold text-slate-900">
            Бүртгэл үүсгэх
          </div>

          {/* Role */}
          <div className="mt-4">
            <div className="text-sm font-semibold text-slate-700 mb-2">
              Төрөл сонгох
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setRole("seller")}
                className={`rounded-xl border px-3 py-3 text-sm font-extrabold ${
                  role === "seller"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Худалдагч
              </button>
              <button
                onClick={() => setRole("driver")}
                className={`rounded-xl border px-3 py-3 text-sm font-extrabold ${
                  role === "driver"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Жолооч
              </button>
            </div>
          </div>

          {/* Step PHONE */}
          {step === "PHONE" && (
            <>
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

              {err && (
                <div className="mt-3 text-sm font-semibold text-red-600">
                  {err}
                </div>
              )}

              <button
                onClick={sendOtp}
                disabled={loading}
                className="mt-5 w-full rounded-xl bg-emerald-600 py-3 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {loading ? "Илгээж байна…" : "SMS код авах"}
              </button>
            </>
          )}

          {/* Step OTP */}
          {step === "OTP" && (
            <>
              <div className="mt-4 text-sm text-slate-600">
                +976{" "}
                <span className="font-extrabold text-slate-900">
                  {clamp(digitsOnly(phone), 8)}
                </span>{" "}
                дугаарт илгээгдсэн код.
              </div>

              <div className="mt-4">
                <label className="text-sm font-semibold text-slate-700">
                  SMS код (6 оронтой)
                </label>
                <input
                  value={otp}
                  onChange={(e) => setOtp(clamp(e.target.value, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              {err && (
                <div className="mt-3 text-sm font-semibold text-red-600">
                  {err}
                </div>
              )}

              <button
                onClick={verifyOtp}
                disabled={loading}
                className="mt-5 w-full rounded-xl bg-emerald-600 py-3 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {loading ? "Шалгаж байна…" : "Баталгаажуулах"}
              </button>

              <button
                onClick={() => {
                  setErr("");
                  setOtp("");
                  setStep("PHONE");
                }}
                className="mt-3 w-full rounded-xl border border-slate-200 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
              >
                Буцах
              </button>
            </>
          )}

          {/* Step SETUP */}
          {step === "SETUP" && (
            <>
              <div className="mt-4">
                <label className="text-sm font-semibold text-slate-700">
                  Нэр ( заавал бөглөнө )
                </label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Жишээ: Батбаяр"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              {role === "seller" && (
                <div className="mt-4">
                  <label className="text-sm font-semibold text-slate-700">
                    Дэлгүүрийн нэр 
                  </label>
                  <input
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Заавал биш"
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              {role === "driver" && (
                <div className="mt-4">
                  <label className="text-sm font-semibold text-slate-700">
                    Машины дугаар
                  </label>

                  <div className="mt-2 flex gap-2">
                    <input
                      value={carNum}
                      onChange={(e) => setCarNum(onlyDigitsN(e.target.value, 4))}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="1234"
                      className="w-[120px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />

                    <input
                      value={carSer}
                      onChange={(e) =>
                        setCarSer(onlyCyrillicN(e.target.value, 3))
                      }
                      maxLength={3}
                      placeholder="АБВ"
                      className="w-[120px] rounded-xl border border-slate-200 px-3 py-2 text-sm uppercase outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    Машины сер дээр латин үсэг орохгүй.
                  </div>
                </div>
              )}

              <div className="mt-4">
                <label className="text-sm font-semibold text-slate-700">
                  4 оронтой PIN үүсгэх
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

              {err && (
                <div className="mt-3 text-sm font-semibold text-red-600">
                  {err}
                </div>
              )}

              <button
                onClick={createAccount}
                disabled={loading}
                className="mt-5 w-full rounded-xl bg-emerald-600 py-3 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {loading ? "Бүртгэж байна…" : "Бүртгэл үүсгэх"}
              </button>
            </>
          )}

          <div className="mt-4 text-center text-sm text-slate-600">
            Аль хэдийн бүртгэлтэй юу?{" "}
            <Link className="font-extrabold text-emerald-700" href="/">
              Нэвтрэх
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
