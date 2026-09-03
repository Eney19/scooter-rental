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

type Entry = { id: string; full_name: string; amount: number; overdue: boolean };

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth(), 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfMonth(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  date.setHours(0, 0, 0, 0);
  return date;
}

function fmtMonth(d: Date) {
  const label = d.toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function AdminCalendarPage() {
  const router = useRouter();
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState("all");
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));

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

  const monthStart = useMemo(() => startOfMonth(monthAnchor), [monthAnchor]);
  const monthEnd = useMemo(() => endOfMonth(monthAnchor), [monthAnchor]);

  const gridDays = useMemo(() => {
    const gridStart = startOfWeek(monthStart);
    const gridEnd = startOfWeek(monthEnd);
    gridEnd.setDate(gridEnd.getDate() + 6);
    const days: Date[] = [];
    const d = new Date(gridStart);
    while (d <= gridEnd) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [monthStart, monthEnd]);

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

  function entriesForDay(day: Date, isToday: boolean): Entry[] {
    const entries: Entry[] = [];
    if (isToday) {
      for (const c of overdueToday) {
        const sub = latestSub(c);
        entries.push({ id: `ov-${c.id}`, full_name: c.full_name, amount: sub?.amount || 0, overdue: true });
      }
    }
    for (const c of dueOnDay(day)) {
      const sub = latestSub(c);
      entries.push({ id: c.id, full_name: c.full_name, amount: sub?.amount || 0, overdue: false });
    }
    return entries;
  }

  const monthTotal = useMemo(() => {
    let sum = 0;
    let d = new Date(monthStart);
    while (d <= monthEnd) {
      for (const c of dueOnDay(d)) {
        const sub = latestSub(c);
        if (sub) sum += sub.amount;
      }
      d = new Date(d);
      d.setDate(d.getDate() + 1);
    }
    return sum;
  }, [monthStart, monthEnd, filtered]);

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
              onClick={() => setMonthAnchor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm"
            >
              ← Місяць
            </button>
            <span className="text-sm font-medium text-slate-700 px-2 min-w-[160px] text-center">
              {fmtMonth(monthStart)}
            </span>
            <button
              onClick={() => setMonthAnchor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm"
            >
              Місяць →
            </button>
            <button
              onClick={() => setMonthAnchor(startOfMonth(new Date()))}
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
          <span className="text-sm text-slate-500">Очікується оплат за місяць</span>
          <span className="text-xl font-bold text-slate-900">{monthTotal.toLocaleString("uk-UA")} грн</span>
        </div>

        {loading ? (
          <p className="text-slate-400 text-center py-12">Завантаження...</p>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-2 mb-2">
              {DAY_NAMES.map(name => (
                <div key={name} className="text-center text-xs font-medium text-slate-400 py-1">
                  {name}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {gridDays.map((day, i) => {
                const isToday = sameDay(day, today);
                const isCurrentMonth = day.getMonth() === monthStart.getMonth();
                const entries = entriesForDay(day, isToday);
                const visible = entries.slice(0, 3);
                const hiddenCount = entries.length - visible.length;

                return (
                  <div
                    key={i}
                    className={`rounded-xl border p-2 min-h-[100px] ${
                      isToday ? "border-blue-400 bg-blue-50" : isCurrentMonth ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-baseline justify-end mb-1.5">
                      <span className={`text-xs font-bold ${isToday ? "text-blue-700" : isCurrentMonth ? "text-slate-600" : "text-slate-300"}`}>
                        {day.getDate()}
                      </span>
                    </div>

                    <div className="space-y-1">
                      {visible.map(e => (
                        <div
                          key={e.id}
                          className={`rounded-lg px-1.5 py-1 border ${e.overdue ? "bg-red-50 border-red-100" : "bg-green-50 border-green-100"}`}
                        >
                          <p className="text-[11px] font-medium text-slate-800 truncate">{e.full_name}</p>
                          <p className={`text-[11px] ${e.overdue ? "text-red-700" : "text-green-700"}`}>
                            {e.overdue ? "Борг: " : ""}{e.amount.toLocaleString("uk-UA")} грн
                          </p>
                        </div>
                      ))}
                      {hiddenCount > 0 && (
                        <p className="text-[11px] text-slate-400 text-center">+{hiddenCount} ще</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
