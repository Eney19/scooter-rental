"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getAdminRole, clearAdminRole } from "@/lib/admin-auth";

type Scooter = {
  id: string;
  name: string;
  model: string | null;
  city: string | null;
  status: string | null;
  gps_tracker_id: string | null;
  gps_sim_phone: string | null;
  gps_locked: boolean | null;
  gps_locked_at: string | null;
  courier?: { id: string; full_name: string } | null;
};

export default function AdminGpsPage() {
  const router = useRouter();
  const [scooters, setScooters] = useState<Scooter[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState("all");
  const [rentedOnly, setRentedOnly] = useState(false);

  useEffect(() => {
    const r = getAdminRole();
    if (!r) {
      router.push("/admin");
      return;
    }
    if (r !== "admin") {
      router.push("/admin/couriers");
      return;
    }
    loadScooters();
  }, []);

  async function loadScooters() {
    setLoading(true);
    const { data } = await supabase
      .from("scooters")
      .select("id, name, model, city, status, gps_tracker_id, gps_sim_phone, gps_locked, gps_locked_at, courier:couriers(id, full_name)")
      .order("name", { ascending: true });
    setScooters((data || []) as unknown as Scooter[]);
    setLoading(false);
  }

  function startEdit(s: Scooter) {
    setEditingId(s.id);
    setPhoneDraft(s.gps_sim_phone || "");
  }

  async function savePhone(id: string) {
    const phone = phoneDraft.trim() || null;
    const { error } = await supabase.from("scooters").update({ gps_sim_phone: phone }).eq("id", id);
    if (error) {
      alert(`Не вдалося зберегти: ${error.message}`);
      return;
    }
    setScooters(prev => prev.map(s => s.id === id ? { ...s, gps_sim_phone: phone } : s));
    setEditingId(null);
  }

  async function blockScooterGps(s: Scooter) {
    if (!confirm(`Надіслати запит на блокування "${s.name}" по GPS? Переконайся, що скутер зараз НЕ в русі. Запит піде в Telegram — SMS відправляє людина, що отримає сповіщення.`)) return;
    setActionLoadingId(s.id);
    const res = await fetch("/api/admin/gps-block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scooterId: s.id }),
    });
    const data = await res.json();
    setActionLoadingId(null);
    if (!data.success) {
      alert(`Не вдалося надіслати запит: ${data.error || "невідома помилка"}`);
      return;
    }
    setScooters(prev => prev.map(x => x.id === s.id ? { ...x, gps_locked: true, gps_locked_at: data.gpsLockedAt } : x));
  }

  async function unblockScooterGps(s: Scooter) {
    if (!confirm(`Надіслати запит на розблокування "${s.name}" по GPS? Запит піде в Telegram — SMS відправляє людина, що отримає сповіщення.`)) return;
    setActionLoadingId(s.id);
    const res = await fetch("/api/admin/gps-unblock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scooterId: s.id }),
    });
    const data = await res.json();
    setActionLoadingId(null);
    if (!data.success) {
      alert(`Не вдалося надіслати запит: ${data.error || "невідома помилка"}`);
      return;
    }
    setScooters(prev => prev.map(x => x.id === s.id ? { ...x, gps_locked: false, gps_locked_at: null } : x));
  }

  const cityFiltered = scooters.filter(s => cityFilter === "all" || s.city === cityFilter);
  const statusFiltered = cityFiltered.filter(s => !rentedOnly || s.status === "rented");
  const withTracker = statusFiltered.filter(s => s.gps_sim_phone || s.gps_tracker_id);
  const withoutTracker = statusFiltered.filter(s => !s.gps_sim_phone && !s.gps_tracker_id);
  const lockedCount = scooters.filter(s => s.gps_locked).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-white text-sm">⚡</span>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">PowerDrive Admin</h1>
          </div>
          <button onClick={() => { clearAdminRole(); router.push("/admin"); }} className="text-sm text-slate-400 hover:text-slate-600 shrink-0">Вийти</button>
        </div>
        <nav className="flex gap-4 text-sm mt-3 overflow-x-auto whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0">
          <a href="/admin/couriers" className="text-slate-500 hover:text-slate-700 shrink-0">Кур&apos;єри</a>
          <a href="/admin/scooters" className="text-slate-500 hover:text-slate-700 shrink-0">Скутери</a>
          <a href="/admin/payments" className="text-slate-500 hover:text-slate-700 shrink-0">Платежі</a>
          <a href="/admin/calendar" className="text-slate-500 hover:text-slate-700 shrink-0">Календар</a>
          <a href="/admin/queue" className="text-slate-500 hover:text-slate-700 shrink-0">Черга</a>
          <a href="/admin/purchases" className="text-slate-500 hover:text-slate-700 shrink-0">Закупити</a>
          <span className="text-blue-600 font-medium border-b-2 border-blue-600 pb-1 shrink-0">GPS</span>
          <a href="/admin/cash" className="text-slate-500 hover:text-slate-700 shrink-0">Каса</a>
        </nav>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="font-bold text-slate-900">GPS-трекери скутерів</h2>
          {lockedCount > 0 && (
            <div className="text-sm text-red-600 font-medium">🔒 Заблоковано: {lockedCount}</div>
          )}
        </div>

        <div className="flex gap-3 mb-4 flex-wrap items-center">
          <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
            <option value="all">Всі міста</option>
            {["Луцьк","Рівне","Львів"].map(c => <option key={c}>{c}</option>)}
          </select>
          <button
            onClick={() => setRentedOnly(v => !v)}
            className={`px-3 py-2 rounded-xl text-sm font-medium border ${rentedOnly ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200 hover:text-slate-700"}`}
          >
            🛵 Лише в оренді
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Завантаження...</div>
          ) : withTracker.length === 0 ? (
            <div className="p-8 text-center text-slate-400">Жоден скутер ще не має вказаного трекера</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-slate-500 text-xs">
                    <th className="px-4 py-3 font-medium">Скутер</th>
                    <th className="px-4 py-3 font-medium">Кур&apos;єр</th>
                    <th className="px-4 py-3 font-medium">Телефон SIM</th>
                    <th className="px-4 py-3 font-medium">Статус</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {withTracker.map(s => (
                    <tr key={s.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{s.name}</div>
                        <div className="text-slate-400 text-xs">{s.model || s.city || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {s.courier ? (
                          <a href={`/admin/couriers?open=${s.courier.id}`} className="text-blue-600 hover:underline">{s.courier.full_name}</a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === s.id ? (
                          <div className="flex gap-2 items-center">
                            <input
                              value={phoneDraft}
                              onChange={e => setPhoneDraft(e.target.value)}
                              placeholder="+380XXXXXXXXX"
                              className="w-36 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                            />
                            <button onClick={() => savePhone(s.id)} className="text-xs text-blue-600 hover:underline shrink-0">OK</button>
                          </div>
                        ) : (
                          <div className="flex gap-2 items-center">
                            <span className="text-slate-700 font-mono text-xs">{s.gps_sim_phone || "—"}</span>
                            <button onClick={() => startEdit(s)} className="text-xs text-slate-400 hover:text-slate-700 shrink-0">Редагувати</button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {s.gps_locked ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">🔒 Заблоковано</span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">🟢 Активний</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        {s.gps_sim_phone && (
                          s.gps_locked ? (
                            <button
                              onClick={() => unblockScooterGps(s)}
                              disabled={actionLoadingId === s.id}
                              className="text-xs bg-green-100 text-green-700 rounded-lg px-3 py-1.5 font-medium hover:bg-green-200 disabled:opacity-60"
                            >
                              🔓 Розблокувати
                            </button>
                          ) : (
                            <button
                              onClick={() => blockScooterGps(s)}
                              disabled={actionLoadingId === s.id}
                              className="text-xs bg-red-100 text-red-700 rounded-lg px-3 py-1.5 font-medium hover:bg-red-200 disabled:opacity-60"
                            >
                              🔒 Заблокувати
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {withoutTracker.length > 0 && (
          <div>
            <p className="text-xs text-slate-400 mb-2">Скутери без трекера ({withoutTracker.length})</p>
            <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100">
              {withoutTracker.map(s => (
                <div key={s.id} className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-600">{s.name}</span>
                  <a href="/admin/scooters" className="text-xs text-blue-500 hover:underline shrink-0">Додати трекер в Скутери →</a>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
