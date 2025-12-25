"use client";

import { useEffect, useState } from "react";

function readUserRaw(): string {
  const keys = ["incomeUser", "user", "authUser"];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v) return v;
  }
  return "";
}

export default function AccountPage() {
  const [raw, setRaw] = useState("");

  useEffect(() => {
    setRaw(readUserRaw());
  }, []);

  return (
    <div className="px-4 py-6">
      <div className="max-w-[720px] mx-auto">
        <div className="text-xl font-black text-slate-900">Account</div>
        <div className="mt-2 text-sm text-slate-600">
          Таны төхөөрөмж дээр хадгалагдсан хэрэглэгчийн мэдээлэл.
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-bold text-slate-500 mb-2">
            localStorage (incomeUser/user/authUser)
          </div>
          <pre className="whitespace-pre-wrap break-words text-sm text-slate-900">
            {raw || "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}
