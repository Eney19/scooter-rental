"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const inp = "w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-slate-900";
const lbl = "block text-sm font-medium text-slate-700 mb-1";

export default function CabinetLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  async function loginWithPassword() {
    if (!identifier || !password) { setError("Заповніть логін і пароль"); return; }
    setLoading(true); setError(null); setNeedsPasswordSetup(false);
    try {
      const res = await fetch("/api/cabinet/login-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Помилка входу");
        if (data.needsPasswordSetup) setNeedsPasswordSetup(true);
        return;
      }
      router.push("/cabinet");
    } catch {
      setError("Помилка з'єднання");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white px-4 py-12">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-6 space-y-4">
        <h1 className="text-2xl font-bold text-slate-900 text-center">Особистий кабінет</h1>
        <p className="text-slate-500 text-center text-sm">Вхід за номером телефону або email</p>

        <div>
          <label className={lbl}>Телефон або email *</label>
          <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={inp} placeholder="+380501234567 або email" />
        </div>
        <div>
          <label className={lbl}>Пароль *</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inp} placeholder="Ваш пароль" />
        </div>

        {error && <p className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</p>}
        {needsPasswordSetup && (
          <Link href="/cabinet/forgot-password" className="block bg-blue-50 text-blue-700 px-4 py-3 rounded-xl text-sm hover:bg-blue-100">
            Встановити пароль через email →
          </Link>
        )}

        <button onClick={loginWithPassword} disabled={loading} className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-semibold hover:bg-blue-700 disabled:opacity-60">
          {loading ? "Вхід..." : "Увійти"}
        </button>

        <Link href="/cabinet/forgot-password" className="block text-center text-sm text-slate-400 hover:text-slate-600">
          Забули пароль або ще не встановлювали?
        </Link>
      </div>
    </div>
  );
}
