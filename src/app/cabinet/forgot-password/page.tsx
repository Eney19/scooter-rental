"use client";
import { useState } from "react";
import Link from "next/link";

const inp = "w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-slate-900";
const lbl = "block text-sm font-medium text-slate-700 mb-1";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email) { setError("Вкажіть email"); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/cabinet/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Помилка. Спробуйте ще раз"); return; }
      setDone(true);
    } catch {
      setError("Помилка з'єднання");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white px-4 py-12">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-6 space-y-4">
        <h1 className="text-2xl font-bold text-slate-900 text-center">Пароль через email</h1>
        {!done ? (
          <>
            <p className="text-slate-500 text-center text-sm">
              Вкажіть email, який був зазначений при реєстрації — надішлемо посилання для встановлення (або скидання) паролю входу в кабінет. Без SMS.
            </p>
            <div>
              <label className={lbl}>Email *</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inp} placeholder="you@example.com" />
            </div>
            {error && <p className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</p>}
            <button onClick={submit} disabled={loading} className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-semibold hover:bg-blue-700 disabled:opacity-60">
              {loading ? "Надсилаємо..." : "Надіслати посилання"}
            </button>
          </>
        ) : (
          <p className="bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm text-center">
            Якщо такий email є в системі — на нього надіслано лист із посиланням для скидання паролю. Перевірте пошту (і теку «Спам»).
          </p>
        )}
        <Link href="/cabinet/login" className="block text-center text-sm text-slate-400 hover:text-slate-600">
          ← До входу
        </Link>
      </div>
    </div>
  );
}
