"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Payment = {
  wayforpay_id: string | null;
  id: string;
  courier_id: string;
  amount: number;
  status: string | null;
  payment_method: string | null;
  created_at: string;
  description: string | null;
  courier?: { full_name: string; phone: string; city: string | null } | null;
};

type Subscription = {
  id: string;
  courier_id: string;
  amount: number;
  status: string | null;
  expires_at: string | null;
  created_at: string;
  courier?: { full_name: string; phone: string } | null;
};

const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  success:  { label: "Оплачено",   color: "bg-green-100 text-green-700" },
  pending:  { label: "Очікує",     color: "bg-yellow-100 text-yellow-700" },
  failed:   { label: "Помилка",    color: "bg-red-100 text-red-700" },
  refunded: { label: "Повернуто",  color: "bg-slate-100 text-slate-500" },
};

const SUB_STATUS: Record<string, { label: string; color: string }> = {
  active:   { label: "Активна",    color: "bg-green-100 text-green-700" },
  paused:   { label: "Призупинена",color: "bg-yellow-100 text-yellow-700" },
  cancelled:{ label: "Скасована",  color: "bg-red-100 text-red-700" },
};

export default function AdminPaymentsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"payments" | "subscriptions">("payments");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("admin_auth") !== "true") {
      router.push("/admin");
      return;
    }
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from("payments").select("*, courier:couriers(full_name, phone, city)").order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("*, courier:couriers(full_name, phone)").order("created_at", { ascending: false }),
    ]);
    setPayments(p || []);
    setSubscriptions(s || []);
    setLoading(false);
  }

  const totalRevenue = payments.filter(p => p.status === "success").reduce((sum, p) => sum + p.amount, 0);
  const activeSubsCount = subscriptions.filter(s => s.status === "active").length;
  const pendingCount = payments.filter(p => p.status === "pending").length;

  const filteredPayments = payments.filter(p => statusFilter === "all" || p.status === statusFilter);
  const filteredSubs = subscriptions.filter(s => statusFilter === "all" || s.status === statusFilter);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm">⚡</span>
          </div>
          <h1 className="text-lg font-bold text-slate-900">PowerDrive Admin</h1>
        </div>
        <nav className="flex gap-4 text-sm">
          <a href="/admin/couriers" className="text-slate-500 hover:text-slate-700">Кур'єри</a>
          <a href="/admin/scooters" className="text-slate-500 hover:text-slate-700">Скутери</a>
          <span className="text-blue-600 font-medium border-b-2 border-blue-600 pb-1">Платежі</span>
        </nav>
        <button onClick={() => { sessionStorage.removeItem("admin_auth"); router.push("/admin"); }} className="text-sm text-slate-400 hover:text-slate-600">Вийти</button>
      </header>

      <div className="p-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Загальний дохід", value: `${totalRevenue.toLocaleString("uk-UA")} грн`, color: "text-green-600", icon: "💰" },
            { label: "Активних підписок", value: activeSubsCount, color: "text-blue-600", icon: "🔄" },
            { label: "Всього платежів", value: payments.length, color: "text-slate-900", icon: "📋" },
            { label: "Очікують оплати", value: pendingCount, color: "text-yellow-600", icon: "⏳" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="text-2xl mb-2">{s.icon}</div>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => { setTab("payments"); setStatusFilter("all"); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "payments" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            Платежі ({payments.length})
          </button>
          <button
            onClick={() => { setTab("subscriptions"); setStatusFilter("all"); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "subscriptions" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            Підписки ({subscriptions.length})
          </button>
        </div>

        {/* Filter */}
        <div className="flex gap-3 mb-4">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="all">Всі статуси</option>
            {tab === "payments"
              ? Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)
              : Object.entries(SUB_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)
            }
          </select>
          <button onClick={loadData} className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50">
            Оновити
          </button>
        </div>

        {/* Payments table */}
        {tab === "payments" && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-slate-400">Завантаження...</div>
            ) : filteredPayments.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <div className="text-4xl mb-3">💳</div>
                <p>Платежів ще немає</p>
                <p className="text-xs mt-2">Платежі з'являться після підключення WayForPay</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Кур'єр</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Місто</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Сума</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Статус</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Опис</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map(p => (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{p.courier?.full_name || "—"}</div>
                        <div className="text-slate-400 text-xs">{p.courier?.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{p.courier?.city || "—"}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{p.amount.toLocaleString("uk-UA")} грн</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${PAYMENT_STATUS[p.status || "pending"]?.color || "bg-slate-100 text-slate-500"}`}>
                          {PAYMENT_STATUS[p.status || "pending"]?.label || "Очікує"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{p.wayforpay_id?.startsWith("cash_") ? "💵 Готівка" : p.wayforpay_id ? "💳 Онлайн" : "—"}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {new Date(p.created_at).toLocaleDateString("uk-UA")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Subscriptions table */}
        {tab === "subscriptions" && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-slate-400">Завантаження...</div>
            ) : filteredSubs.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <div className="text-4xl mb-3">🔄</div>
                <p>Підписок ще немає</p>
                <p className="text-xs mt-2">Підписки з'являться після підключення WayForPay</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Кур'єр</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Сума/тиждень</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Статус</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Наступний платіж</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Початок</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubs.map(s => (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{s.courier?.full_name || "—"}</div>
                        <div className="text-slate-400 text-xs">{s.courier?.phone}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{s.amount.toLocaleString("uk-UA")} грн</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${SUB_STATUS[s.status || "active"]?.color || "bg-green-100 text-green-700"}`}>
                          {SUB_STATUS[s.status || "active"]?.label || "Активна"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {s.expires_at ? new Date(s.expires_at).toLocaleDateString("uk-UA") : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {new Date(s.created_at).toLocaleDateString("uk-UA")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
