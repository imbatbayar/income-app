"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState(""); // имэйл эсвэл утас
  const [password, setPassword] = useState(""); // 4 оронтой PIN
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!identifier.trim() || !password.trim()) {
      setError("Имэйл/утас болон нууц үгээ бөглөнө үү.");
      return;
    }

    setIsSubmitting(true);

    const { data, error: selectError } = await supabase
      .from("users")
      .select("*")
      .or(`email.eq.${identifier},phone.eq.${identifier}`)
      .maybeSingle();

    if (selectError) {
      console.error(selectError);
      setIsSubmitting(false);
      setError("Серверийн алдаа гарлаа. Дахин оролдоно уу.");
      return;
    }

    if (!data) {
      setIsSubmitting(false);
      setError("Ийм хэрэглэгч бүртгэлгүй байна.");
      return;
    }

    if (data.pin !== password) {
      setIsSubmitting(false);
      setError("Нууц үг буруу байна.");
      return;
    }

    // ✅ Амжилттай нэвтэрвэл localStorage-д хадгалаад role-оор нь чиглүүлнэ
    const user = {
      id: data.id,
      role: data.role,
      name: data.name,
      phone: data.phone,
      email: data.email,
    };

    if (typeof window !== "undefined") {
      localStorage.setItem("incomeUser", JSON.stringify(user));
    }

    setIsSubmitting(false);

    if (data.role === "seller") {
      router.push("/seller");
    } else {
      router.push("/driver");
    }
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
            Хүргэлтийн marketplace
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Утас эсвэл имэйлээрээ нэвтэрч, хүргэлтийн системээ ашигла.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">
            Нэвтрэх
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            Өмнө бүртгүүлсэн имэйл эсвэл утасны дугаараар нэвтэрнэ.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email / Phone */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Имэйл эсвэл утасны дугаар
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50"
                placeholder="example@mail.com эсвэл 88xxxxxx"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Нууц үг (4 оронтой PIN)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50 pr-10 tracking-[0.3em]"
                  placeholder="••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 px-3 text-xs text-slate-500 hover:text-slate-700"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? "Нуух" : "Харах"}
                </button>
              </div>
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
              {isSubmitting ? "Нэвтрэж байна..." : "Нэвтрэх"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center mt-6 mb-4">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="mx-3 text-xs text-slate-400">эсвэл</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Register link */}
          <p className="text-sm text-slate-600 text-center">
            Шинэ хэрэглэгч үү?{" "}
            <Link
              href="/register"
              className="font-semibold text-emerald-600 hover:text-emerald-700"
            >
              Бүртгэл үүсгэх
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="mt-6 text-xs text-slate-400 text-center">
          INCOME v1.0 · BABA &amp; Hypatia · 2025
        </p>
      </div>
    </div>
  );
}
