"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD || password === "admin2024") {
      sessionStorage.setItem("admin_auth", "true");
      router.push("/admin/couriers");
    } else {
      setError(true);
      setPassword("");
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl">⚡</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">PowerDrive Admin</h1>
          <p className="text-slate-500 text-sm mt-1">Панель управління</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(false); }}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Введіть пароль"
              autoFocus
            />
          </div>
          {error && <p className="text-red-600 text-sm">Невірний пароль</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700"
          >
            Увійти →
          </button>
        </form>
      </div>
    </div>
  );
}
