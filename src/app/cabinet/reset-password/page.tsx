"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const inp = "w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-slate-900";
const lbl = "block text-sm font-medium text-slate-700 mb-1";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const courierId = params.get("courierId") || "";
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (password.length < 6) { setError("Пароль має містити щонайменше 6 символів"); return; }
    if (password !== password2) { setError("Паролі не збігаються"); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/cabinet/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierId, token, newPassword: password }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Помилка. Спробуйте ще раз"); return; }
      setDone(true);
      setTimeout(() => router.push("/cabinet/login"), 1500);
    } catch {
      setError("Помилка з'єднання");
    } finally {
      setLoading(false);
    }
  }

  if (!courierId || !token) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white px-4 py-12">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <p className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm text-center">
            Посилання недійсне. Запросіть скидання паролю ще раз.
          </p>
          <Link href="/cabinet/forgot-password" className="block text-center text-blue-600 hover:underline text-sm">
            Забули пароль?
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white px-4 py-12">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-6 space-y-4">
        <h1 className="text-2xl font-bold text-slate-900 text-center">Новий пароль</h1>
        {!done ? (
          <>
            <div>
              <label className={lbl}>Новий пароль *</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inp} placeholder="Щонайменше 6 символів" />
            </div>
            <div>
              <label className={lbl}>Повторіть пароль *</label>
              <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} className={inp} />
            </div>
            {error && <p className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</p>}
            <button onClick={submit} disabled={loading} className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-semibold hover:bg-blue-700 disabled:opacity-60">
              {loading ? "Збереження..." : "Зберегти пароль"}
            </button>
          </>
        ) : (
          <p className="bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm text-center">
            Пароль збережено! Переходимо на вхід...
          </p>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
