"use client";

/* ===========================
 * app/driver/profile/page.tsx (FINAL v2)
 * ✅ Жолооч:
 *  - Профайл зураг (users.avatar_url + Storage: avatars bucket)
 *  - Банк/IBAN мэдээлэл (driver_profiles)
 * ✅ Alerts: 8 секундэд автоматаар алга болно
 * =========================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Role = "seller" | "driver";
type IncomeUser = { id: string; role: Role; name: string; phone: string; email: string };

type DriverProfile = {
  driver_id: string;
  bank_name: string | null;
  iban: string | null;
  account_number: string | null;
  account_holder: string | null;
  updated_at: string | null;
};

export default function DriverProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<IncomeUser | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // bank fields
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");

  // avatar
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // ✅ 8s auto-dismiss
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 8000);
    return () => clearTimeout(t);
  }, [msg]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("incomeUser");
      if (!raw) return router.replace("/");
      const u: IncomeUser = JSON.parse(raw);
      if (u.role !== "driver") return router.replace("/");
      setUser(u);
    } catch {
      router.replace("/");
    }
  }, [router]);

  useEffect(() => {
    if (!user) return;
    void loadAll(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const avatarFallback = useMemo(() => {
    const n = (user?.name || "").trim();
    return n ? n.slice(0, 1).toUpperCase() : "D";
  }, [user?.name]);

  async function loadAll(driverId: string) {
    setLoading(true);
    setError(null);
    setMsg(null);

    try {
      // 1) bank profile
      const { data: pData, error: pErr } = await supabase
        .from("driver_profiles")
        .select("driver_id, bank_name, iban, account_number, account_holder, updated_at")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (pErr) throw pErr;

      const p = (pData as DriverProfile | null) || null;
      setBankName(p?.bank_name || "");
      setIban(p?.iban || "");
      setAccountNumber(p?.account_number || "");
      setAccountHolder(p?.account_holder || "");

      // 2) avatar_url from users
      const { data: uData, error: uErr } = await supabase
        .from("users")
        .select("avatar_url")
        .eq("id", driverId)
        .maybeSingle();

      if (uErr) {
        // users table байхгүй/column байхгүй үед app унагахгүй
        console.warn("users.avatar_url load failed:", uErr);
      } else {
        setAvatarUrl((uData as any)?.avatar_url || "");
      }
    } catch (e) {
      console.error(e);
      setError("Профайл татахад алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  }

  async function saveBankProfile() {
    if (!user) return;
    if (saving) return;

    setSaving(true);
    setError(null);
    setMsg(null);

    try {
      const payload = {
        driver_id: user.id,
        bank_name: bankName.trim() || null,
        iban: iban.trim() || null,
        account_number: accountNumber.trim() || null,
        account_holder: accountHolder.trim() || null,
      };

      const { error } = await supabase.from("driver_profiles").upsert(payload, { onConflict: "driver_id" });
      if (error) throw error;

      setMsg("Хадгаллаа.");
    } catch (e) {
      console.error(e);
      setError("Хадгалахад алдаа гарлаа.");
    } finally {
      setSaving(false);
    }
  }

  function openFilePicker() {
    fileRef.current?.click();
  }

  async function onPickAvatar(file: File | null) {
    if (!user) return;
    if (!file) return;

    // basic checks
    if (!file.type.startsWith("image/")) {
      setError("Зөвхөн зураг сонгоно уу.");
      return;
    }
    const maxMB = 5;
    if (file.size > maxMB * 1024 * 1024) {
      setError(`Зураг ${maxMB}MB-с бага байх ёстой.`);
      return;
    }

    setAvatarUploading(true);
    setError(null);
    setMsg(null);

    try {
      // ✅ storage path
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
      const path = `drivers/${user.id}/${Date.now()}.${safeExt}`;

      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
      });

      if (upErr) {
        console.error(upErr);
        setError("Зураг upload хийхэд алдаа гарлаа.");
        return;
      }

      // ✅ public url
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = data?.publicUrl || "";

      if (!publicUrl) {
        setError("Зургийн холбоос үүсгэж чадсангүй.");
        return;
      }

      // ✅ save to users.avatar_url
      const { error: uErr } = await supabase.from("users").update({ avatar_url: publicUrl }).eq("id", user.id);
      if (uErr) {
        console.error(uErr);
        setError("Зургийн холбоос хадгалахад алдаа гарлаа. (users.avatar_url)");
        return;
      }

      setAvatarUrl(publicUrl);
      setMsg("Профайл зураг шинэчлэгдлээ.");
    } catch (e) {
      console.error(e);
      setError("Зураг шинэчлэхэд алдаа гарлаа.");
    } finally {
      setAvatarUploading(false);
      // reset input to allow re-select same file
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => router.push("/driver")}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            ← Буцах
          </button>
          <div className="text-xs text-slate-500">Жолооч · Профайл</div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {msg && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {msg}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">Ачаалж байна…</div>
        ) : (
          <>
            {/* Avatar card */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                    ) : (
                      <div className="text-lg font-semibold text-slate-700">{avatarFallback}</div>
                    )}
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-slate-900">{user?.name || "Жолооч"}</div>
                    <div className="text-xs text-slate-500">{user?.phone || ""}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void onPickAvatar(e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={openFilePicker}
                    disabled={avatarUploading}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {avatarUploading ? "Upload…" : "Зураг оруулах"}
                  </button>
                </div>
              </div>

              <div className="mt-3 text-[11px] text-slate-500">
                Энэ зураг нь худалдагчийн “Санал ирсэн жолооч” жижиг карт дээр харагдана.
              </div>
            </section>

            {/* Bank profile card */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <h1 className="text-lg font-semibold text-slate-900">Төлбөр хүлээж авах данс</h1>
              <p className="text-xs text-slate-500">
                Худалдагчид зөвхөн “Хүргэсэн/Төлсөн/Маргаан/Хаагдсан” үед харагдана.
              </p>

              <div className="grid gap-3">
                <div>
                  <div className="text-[11px] text-slate-600 mb-1">Банк</div>
                  <input
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    placeholder="Ж: ХААН БАНК"
                  />
                </div>

                <div>
                  <div className="text-[11px] text-slate-600 mb-1">IBAN</div>
                  <input
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    placeholder="MN.."
                  />
                </div>

                <div>
                  <div className="text-[11px] text-slate-600 mb-1">Дансны дугаар</div>
                  <input
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    placeholder="5700..."
                  />
                </div>

                <div>
                  <div className="text-[11px] text-slate-600 mb-1">Данс эзэмшигч</div>
                  <input
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    placeholder="Овог Нэр"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => void saveBankProfile()}
                  disabled={saving}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {saving ? "Хадгалж байна…" : "Хадгалах"}
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
