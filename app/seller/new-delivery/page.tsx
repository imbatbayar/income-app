"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Role = "seller" | "driver";

type IncomeUser = {
  id: string;
  role: Role;
  name: string;
  phone: string;
  email: string;
};

export default function NewDeliveryPage() {
  const router = useRouter();

  const [user, setUser] = useState<IncomeUser | null>(null);

  const [deliveryType, setDeliveryType] = useState("apartment");
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("");

  const [loadingUser, setLoadingUser] = useState(true);
  const [sending, setSending] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("incomeUser");
      if (!raw) {
        router.replace("/");
        return;
      }

      const parsed: IncomeUser = JSON.parse(raw);

      if (parsed.role !== "seller") {
        router.replace("/driver");
        return;
      }

      setUser(parsed);

      // 🧠 АВАХ хаягийн сүүлийн утгыг автоматаар дүүргэх
      const savedFrom = window.localStorage.getItem(
        "incomeLastFromAddress"
      );
      if (savedFrom && savedFrom.trim().length > 0) {
        setFromAddress(savedFrom);
      }

      setLoadingUser(false);
    } catch (e) {
      console.error(e);
      setError("Хэрэглэгчийн мэдээлэл уншихад алдаа гарлаа.");
      setLoadingUser(false);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setError(null);
    setSuccess(false);

    if (!fromAddress.trim()) {
      setError("АВАХ хаяг хоосон байна.");
      return;
    }
    if (!toAddress.trim()) {
      setError("ХҮРГЭХ хаяг хоосон байна.");
      return;
    }
    if (!receiverPhone.trim()) {
      setError("ХҮЛЭЭН АВАХ хүний утас заавал.");
      return;
    }
    if (!price.trim() || isNaN(Number(price))) {
      setError("Үнэ (₮) зөв оруулна уу.");
      return;
    }

    try {
      setSending(true);

      const { error: insertError } = await supabase
        .from("deliveries")
        .insert({
          seller_id: user.id,
          delivery_type: deliveryType,
          from_address: fromAddress,
          to_address: toAddress,
          receiver_phone: receiverPhone,
          note,
          price_mnt: Number(price),
          status: "OPEN",
        });

      if (insertError) {
        console.error(insertError);
        setError("Хүргэлтийн мэдээлэл илгээхэд алдаа гарлаа.");
        setSending(false);
        return;
      }

      // ✅ Амжилттай илгээсний дараа АВАХ хаягийг санах
      window.localStorage.setItem(
        "incomeLastFromAddress",
        fromAddress
      );

      setSuccess(true);

      setTimeout(() => {
        router.push("/seller");
      }, 900);
    } catch (err) {
      console.error(err);
      setError("Сервертэй холбогдоход алдаа гарлаа.");
    } finally {
      setSending(false);
    }
  }

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Ачаалж байна…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Нэвтрээгүй байна.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
  <div className="max-w-3xl mx-auto px-4 py-4">
    <div className="flex items-center gap-3">
      <div className="inline-flex items-center justify-center rounded-full bg-emerald-50 px-3 py-1">
        <span className="text-xs font-semibold text-emerald-700">
          INCOME
        </span>
      </div>

      <div>
        <h1 className="text-sm font-semibold text-slate-900">
          Хүргэлт үүсгэх
        </h1>
        <p className="text-xs text-slate-500">
          Мэдээллээ үнэн зөв бөглөөд илгээгээрэй.
        </p>
      </div>
    </div>

    {/* ← Буцах */}
    <button
      onClick={() => router.push("/seller")}
      className="mt-3 text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
    >
      ← Буцах
    </button>
  </div>
</header>


      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {success && (
          <div className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
            Хүргэлт амжилттай үүсгэгдлээ!
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Хүргэлтийн төрөл */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">
              Хүргэлтийн төрөл
            </label>
            <select
              value={deliveryType}
              onChange={(e) => setDeliveryType(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
            >
              <option value="apartment">🏙 Байр</option>
              <option value="ger">🏠 Гэр хороолол</option>
              <option value="camp">🏕 Лагер</option>
              <option value="countryside">
                🚌 Орон нутаг (унаанд тавих)
              </option>
            </select>
          </div>

          {/* Үнэ */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">
              Үнэ (₮)
            </label>
            <input
              type="number"
              inputMode="numeric"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
              placeholder="Ж: 5000"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          {/* Авах хаяг */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">
              АВАХ хаяг
            </label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
              placeholder="Ж: БГД, 3-р хороо, 5-р хороолол…"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
            />
            <p className="text-[11px] text-slate-400">
              Энэ нь ихэвчлэн өөрчлөгдөхгүй (танай дэлгүүр/агуулах). Нэг
              удаа бөглөсний дараа дараагийн хүргэлтүүдэд автоматаар
              гарч ирнэ.
            </p>
          </div>

          {/* Хүргэх хаяг */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">
              ХҮРГЭХ хаяг
            </label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
              placeholder="Ж: СБД, 6-р хороо, Энх тайвны өргөн чөлөө…"
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
            />
          </div>

          {/* Хүлээн авагч */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">
              ХҮЛЭЭН АВАХ хүний утас
            </label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
              placeholder="Ж: 9911XXXX"
              value={receiverPhone}
              onChange={(e) => setReceiverPhone(e.target.value)}
            />
          </div>

          {/* Юу хүргүүлэх */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">
              Юу хүргүүлэх гэж байгаа (товч)
            </label>
            <textarea
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm h-20"
              placeholder="Ж: 2 хайрцаг ус, 1 тоног төхөөрөмж…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Илгээх */}
          <div>
            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-xl bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700 disabled:bg-emerald-400 transition"
            >
              {sending ? "Илгээж байна…" : "Хүргэлт үүсгэх"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
