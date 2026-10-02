"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type QueueEntry = {
  id: string;
  city: string;
  full_name: string;
  is_active: boolean;
  created_by_username: string | null;
  created_at: string;
};

const CITIES = ["Луцьк", "Рівне", "Львів"];

export default function AdminQueuePage() {
  const router = useRouter();
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("admin_auth") !== "true") {
      router.push("/admin");
      return;
    }
    loadEntries();
  }, []);

  async function loadEntries() {
    setLoading(true);
    const { data } = await supabase
      .from("rental_queue")
      .select("*")
      .order("created_at", { ascending: false });
    setEntries(data || []);
    setLoading(false);
  }

  async function toggleActive(entry: QueueEntry) {
    setTogglingId(entry.id);
    const { error } = await supabase
      .from("rental_queue")
      .update({ is_active: !entry.is_active })
      .eq("id", entry.id);
    if (!error) {
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, is_active: !e.is_active } : e));
    } else {
      alert("Не вдалося оновити запис");
    }
    setTogglingId(null);
  }

  const filtered = entries.filter(e => cityFilter === "all" || e.city === cityFilter);
  const activeCount = entries.filter(e => e.is_active).length;
  const inactiveCount = entries.filter(e => !e.is_active).length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-white text-sm">⚡</span>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">PowerDrive Admin</h1>
          </div>
          <button
            onClick={() => { sessionStorage.removeItem("admin_auth"); router.push("/admin"); }}
            className="text-sm text-slate-400 hover:text-slate-600 shrink-0"
          >
            Вийти
          </button>
        </div>
        <nav className="flex gap-4 text-sm mt-3 overflow-x-auto whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0">
          <a href="/admin/couriers" className="text-slate-500 hover:text-slate-700 shrink-0">Кур'єри</a>
          <a href="/admin/scooters" className="text-slate-500 hover:text-slate-700 shrink-0">Скутери</a>
          <a href="/admin/payments" className="text-slate-500 hover:text-slate-700 shrink-0">Платежі</a>
          <a href="/admin/calendar" className="text-slate-500 hover:text-slate-700 shrink-0">Календар</a>
          <span className="text-blue-600 font-medium border-b-2 border-blue-600 pb-1 shrink-0">Черга</span>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{entries.length}</div>
            <div className="text-xs text-slate-400 mt-1">Всього</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{activeCount}</div>
            <div className="text-xs text-slate-400 mt-1">Актуальних</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-2xl font-bold text-slate-400">{inactiveCount}</div>
            <div className="text-xs text-slate-400 mt-1">Не актуальних</div>
          </div>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {["all", ...CITIES].map(c => (
            <button
              key={c}
              onClick={() => setCityFilter(c)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                cityFilter === c
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-500 border border-slate-200 hover:text-slate-700"
              }`}
            >
              {c === "all" ? "Усі міста" : c}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Завантаження...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <p>Черга порожня</p>
              <p className="text-xs mt-2">Записи додаються через Telegram-бота для швидкого внесення черги</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">ПІБ кур'єра</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Місто</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Дата внесення</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Додав</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Статус</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className={`px-4 py-3 font-medium ${e.is_active ? "text-slate-900" : "text-slate-400 line-through"}`}>
                      {e.full_name}
                    </td>
                    <td className={`px-4 py-3 ${e.is_active ? "text-slate-600" : "text-slate-400"}`}>{e.city}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {new Date(e.created_at).toLocaleString("uk-UA")}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{e.created_by_username || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        e.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                      }`}>
                        {e.is_active ? "Актуальний" : "Не актуальний"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(e)}
                        disabled={togglingId === e.id}
                        className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-50"
                      >
                        {e.is_active ? "Позначити не актуальним" : "Повернути в чергу"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
