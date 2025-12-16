"use client";

/* ===========================
 * app/driver/profile/page.tsx (FINAL v1)
 * ✅ Жолооч өөрийн банк/IBAN мэдээллээ оруулна (driver_profiles)
 * =========================== */

import { useEffect, useState } from "react";
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

  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

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
    void loadProfile(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function loadProfile(driverId: string) {
    setLoading(true);
    setError(null);
    setMsg(null);

    try {
      const { data, error } = await supabase
        .from("driver_profiles")
        .select("driver_id, bank_name, iban, account_number, account_holder, updated_at")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (error) throw error;

      const p = (data as DriverProfile | null) || null;
      setBankName(p?.bank_name || "");
      setIban(p?.iban || "");
      setAccountNumber(p?.account_number || "");
      setAccountHolder(p?.account_holder || "");
    } catch (e) {
      console.error(e);
      setError("Профайл татахад алдаа гарлаа.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
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
          <div className="text-xs text-slate-500">Жолооч · Данс</div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {msg && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">Ачаалж байна…</div>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <h1 className="text-lg font-semibold text-slate-900">Төлбөр хүлээж авах данс</h1>
            <p className="text-xs text-slate-500">Худалдагчид зөвхөн “Хүргэсэн/Төлсөн/Маргаан/Хаагдсан” үед харагдана.</p>

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
                onClick={() => void save()}
                disabled={saving}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? "Хадгалж байна…" : "Хадгалах"}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
