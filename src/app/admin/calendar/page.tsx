"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Sub = { id: string; expires_at: string; amount: number; status: string };
type Courier = {
  id: string;
  full_name: string;
  phone: string;
  city: string | null;
  subscriptions: Sub[];
};

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function AdminCalendarPage() {
  const router = useRouter();
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState("all");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("admin_auth") !== "true") {
      router.push("/admin");
      return;
    }
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase
      .from("couriers")
      .select("id, full_name, phone, city, subscriptions(id, expires_at, amount, status)");
    setCouriers((data as Courier[]) || []);
    setLoading(false);
  }

  const cities = useMemo(() => {
    const set = new Set(couriers.map(c => c.city).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [couriers]);

  const filtered = useMemo(
    () => (cityFilter === "all" ? couriers : couriers.filter(c => c.city === cityFilter)),
    [couriers, cityFilter]
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  // Для кожного кур'єра беремо його останню (найновішу) підписку
  function latestSub(c: Courier): Sub | null {
    const subs = c.subscriptions || [];
    if (subs.length === 0) return null;
    return subs.sort((a, b) => new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime())[0];
  }

  const overdueToday = useMemo(() => {
    return filtered.filter(c => {
      const sub = latestSub(c);
      if (!sub) return false;
      const expires = new Date(sub.expires_at);
      expires.setHours(0, 0, 0, 0);
      return expires < today && sub.status === "active";
    });
  }, [filtered]);

  function dueOnDay(day: Date) {
    return filtered.filter(c => {
      const sub = latestSub(c);
      if (!sub) return false;
      const expires = new Date(sub.expires_at);
      expires.setHours(0, 0, 0, 0);
      return sameDay(expires, day) && sub.status === "active";
    });
  }

  const weekTotal = useMemo(() => {
    let sum = 0;
    for (const day of weekDays) {
      for (const c of dueOnDay(day)) {
        const sub = latestSub(c);
        if (sub) sum += sub.amount;
      }
    }
    return sum;
  }, [weekDays, filtered]);

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
          <a href="/admin/payments" className="text-slate-500 hover:text-slate-700">Платежі</a>
          <span className="text-blue-600 font-medium border-b-2 border-blue-600 pb-1">Календар</span>
        </nav>
        <button
          onClick={() => { sessionStorage.removeItem("admin_auth"); router.push("/admin"); }}
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          Вийти
        </button>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm"
            >
              ← Тиждень
            </button>
            <span className="text-sm font-medium text-slate-700 px-2">
              {fmtDate(weekDays[0])} — {fmtDate(weekDays[6])}
            </span>
            <button
              onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm"
            >
              Тиждень →
            </button>
            <button
              onClick={() => setWeekStart(startOfWeek(new Date()))}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm text-blue-600"
            >
              Сьогодні
            </button>
          </div>

          <select
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="all">Всі міста</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 flex items-center justify-between">
          <span className="text-sm text-slate-500">Очікується оплат за тиждень</span>
          <span className="text-xl font-bold text-slate-900">{weekTotal.toLocaleString("uk-UA")} грн</span>
        </div>

        {loading ? (
          <p className="text-slate-400 text-center py-12">Завантаження...</p>
        ) : (
          <div className="grid grid-cols-7 gap-3">
            {weekDays.map((day, i) => {
              const isToday = sameDay(day, today);
              const due = dueOnDay(day);
              const showOverdue = isToday ? overdueToday : [];

              return (
                <div
                  key={i}
                  className={`rounded-xl border p-3 min-h-[180px] ${isToday ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <span className={`text-xs font-medium ${isToday ? "text-blue-600" : "text-slate-400"}`}>
                      {DAY_NAMES[i]}
                    </span>
                    <span className={`text-sm font-bold ${isToday ? "text-blue-700" : "text-slate-600"}`}>
                      {fmtDate(day)}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {due.map(c => {
                      const sub = latestSub(c);
                      return (
                        <div key={c.id} className="bg-green-50 border border-green-100 rounded-lg px-2 py-1.5">
                          <p className="text-xs font-medium text-slate-800 truncate">{c.full_name}</p>
                          <p className="text-xs text-green-700">{sub?.amount.toLocaleString("uk-UA")} грн</p>
                        </div>
                      );
                    })}

                    {showOverdue.map(c => {
                      const sub = latestSub(c);
                      return (
                        <div key={`ov-${c.id}`} className="bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">
                          <p className="text-xs font-medium text-slate-800 truncate">{c.full_name}</p>
                          <p className="text-xs text-red-700">Борг: {sub?.amount.toLocaleString("uk-UA")} грн</p>
                        </div>
                      );
                    })}

                    {due.length === 0 && showOverdue.length === 0 && (
                      <p className="text-xs text-slate-300 text-center py-4">—</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
