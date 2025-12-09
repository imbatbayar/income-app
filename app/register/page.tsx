"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Role = "seller" | "driver";

export default function RegisterPage() {
  const router = useRouter();

  const [role, setRole] = useState<Role>("seller");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [agree, setAgree] = useState(false);

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roleLabel = role === "seller" ? "Худалдагч" : "Жолооч";

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    // --- Фронт талын шалгалт ---
    if (!name.trim()) {
      setError("Нэрээ бөглөнө үү.");
      return;
    }
    if (!phone.trim()) {
      setError("Утасны дугаараа бөглөнө үү.");
      return;
    }
    if (!email.trim()) {
      setError("Имэйл хаягаа бөглөнө үү.");
      return;
    }
    if (!email.includes("@") || !email.includes(".")) {
      setError("Имэйл хаягаа зөв форматтай оруулна уу.");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError("Нууц үг 4 оронтой тоо байх ёстой.");
      return;
    }
    if (pin !== pin2) {
      setError("Нууц үг хоёр таарахгүй байна.");
      return;
    }
    if (!agree) {
      setError("Ашиглах нөхцөлтэй танилцаж зөвшөөрөх шаардлагатай.");
      return;
    }

    setIsSubmitting(true);

    // --- Утас / имэйл давтагдаж байгаа эсэхийг шалгана ---
    const { data: existing, error: existsError } = await supabase
      .from("users")
      .select("id")
      .or(`phone.eq.${phone},email.eq.${email}`)
      .maybeSingle();

    if (existsError) {
      console.error(existsError);
      setIsSubmitting(false);
      setError("Серверийн алдаа гарлаа. Дараа дахин оролдоно уу.");
      return;
    }

    if (existing) {
      setIsSubmitting(false);
      setError("Энэ утас эсвэл имэйлээр аль хэдийн бүртгүүлсэн байна.");
      return;
    }

    // --- Жинхэнэ insert ---
    const { error: insertError } = await supabase.from("users").insert({
      role,
      name,
      phone,
      email,
      pin, // v2 дээр PIN-г hash хийнэ
    });

    if (insertError) {
      console.error(insertError);
      setIsSubmitting(false);
      setError("Бүртгэл үүсгэхэд алдаа гарлаа.");
      return;
    }

    // Амжилттай → Login руу
    setIsSubmitting(false);
    router.push("/");
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Top logo / title */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center rounded-full bg-emerald-50 px-4 py-2 mb-3">
            <span className="text-sm font-semibold text-emerald-700">
              INCOME
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Бүртгэл үүсгэх
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Жолооч эсвэл Худалдагч хэлбэрээр нэг удаа бүртгүүлж ашиглана.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          {/* Role toggle */}
          <div className="flex mb-6 rounded-xl bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setRole("seller")}
              className={`flex-1 text-sm font-medium py-2 rounded-lg transition ${
                role === "seller"
                  ? "bg-white shadow-sm text-emerald-700"
                  : "text-slate-500"
              }`}
            >
              Худалдагч
            </button>
            <button
              type="button"
              onClick={() => setRole("driver")}
              className={`flex-1 text-sm font-medium py-2 rounded-lg transition ${
                role === "driver"
                  ? "bg-white shadow-sm text-emerald-700"
                  : "text-slate-500"
              }`}
            >
              Жолооч
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Нэр
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50"
                placeholder="Жишээ: Батбаяр"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Утасны дугаар
              </label>
              <input
                type="tel"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50"
                placeholder="Жишээ: 88112233"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">
                Нэг утасны дугаараар зөвхөн нэг л удаа бүртгүүлнэ.
              </p>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Имэйл хаяг
              </label>
              <input
                type="email"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50"
                placeholder="example@mail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">
                Имэйлээр нууц үг сэргээх, баталгаажуулах мэдээлэл очно.
              </p>
            </div>

            {/* PIN */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Нууц үг (4 оронтой PIN)
              </label>
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={4}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50 pr-10 tracking-[0.3em]"
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    setPin(v);
                  }}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 px-3 text-xs text-slate-500 hover:text-slate-700"
                  onClick={() => setShowPin((v) => !v)}
                >
                  {showPin ? "Нуух" : "Харах"}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Зөвхөн 4 оронтой тоо байхаар тохируулна (жишээ: 1234).
              </p>
            </div>

            {/* PIN confirm */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Нууц үг давтах
              </label>
              <input
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                maxLength={4}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50 tracking-[0.3em]"
                placeholder="••••"
                value={pin2}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setPin2(v);
                }}
              />
            </div>

            {/* Terms */}
            <div className="flex items-start gap-2 pt-1">
              <input
                id="agree"
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label
                htmlFor="agree"
                className="text-xs text-slate-600 leading-relaxed"
              >
                Би INCOME хүргэлтийн marketplace-ийн ашиглах нөхцөл, хувийн
                мэдээлэл ашиглах журмыг уншиж танилцсан бөгөөд{" "}
                <span className="font-semibold">зөвшөөрч байна.</span>
              </label>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl bg-red-50 text-red-700 text-sm px-3 py-2">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center rounded-xl bg-emerald-600 text-white text-sm font-semibold py-2.5 mt-2 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-emerald-700 transition-colors"
            >
              {isSubmitting
                ? "Бүртгэл үүсгэж байна..."
                : `${roleLabel} бүртгэл үүсгэх`}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center mt-6 mb-4">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="mx-3 text-xs text-slate-400">эсвэл</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Back to login */}
          <p className="text-sm text-slate-600 text-center">
            Аль хэдийн бүртгэлтэй юу?{" "}
            <Link
              href="/"
              className="font-semibold text-emerald-600 hover:text-emerald-700"
            >
              Нэвтрэх
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="mt-6 text-xs text-slate-400 text-center">
          INCOME v1.0 · {roleLabel} бүртгэл · Монгол
        </p>
      </div>
    </div>
  );
}
