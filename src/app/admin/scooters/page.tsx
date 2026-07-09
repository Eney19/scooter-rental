"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase, supabaseAdmin } from "@/lib/supabase";

type Scooter = {
  id: string;
  name: string;
  model: string | null;
  vin: string | null;
  city: string | null;
  status: string | null;
  battery_level: number | null;
  gps_tracker_id: string | null;
  courier_id: string | null;
  notes: string | null;
  created_at: string;
  courier?: { full_name: string; phone: string } | null;
};

const STATUS: Record<string, { label: string; color: string; icon: string }> = {
  available:  { label: "Вільний",    color: "bg-green-100 text-green-700",  icon: "✅" },
  rented:     { label: "В оренді",   color: "bg-blue-100 text-blue-700",    icon: "🛵" },
  maintenance:{ label: "Сервіс",     color: "bg-orange-100 text-orange-700",icon: "🔧" },
  blocked:    { label: "Заблоковано",color: "bg-red-100 text-red-700",      icon: "🔒" },
};

export default function AdminScootersPage() {
  const router = useRouter();
  const [scooters, setScooters] = useState<Scooter[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Scooter | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [newScooter, setNewScooter] = useState({
    name: "", model: "", vin: "", city: "Луцьк", gps_tracker_id: "", notes: ""
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("admin_auth") !== "true") {
      router.push("/admin");
      return;
    }
    loadScooters();
  }, []);

  async function loadScooters() {
    setLoading(true);
    const { data } = await supabase
      .from("scooters")
      .select("*, courier:couriers(full_name, phone)")
      .order("created_at", { ascending: false });
    setScooters(data || []);
    setLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from("scooters").update({ status }).eq("id", id);
    setScooters(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null);
  }

  async function addScooter() {
    if (!newScooter.name) return;
    setSaving(true);
    const { data, error } = await supabase.from("scooters").insert({
      name: newScooter.name,
      model: newScooter.model || null,
      vin: newScooter.vin || null,
      city: newScooter.city,
      gps_tracker_id: newScooter.gps_tracker_id || null,
      notes: newScooter.notes || null,
      status: "available",
    }).select().single();
    setSaving(false);
    if (!error && data) {
      setScooters(prev => [data, ...prev]);
      setShowAdd(false);
      setNewScooter({ name: "", model: "", vin: "", city: "Луцьк", gps_tracker_id: "", notes: "" });
    }
  }

  const filtered = scooters.filter(s => {
    const matchCity = cityFilter === "all" || s.city === cityFilter;
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    return matchCity && matchStatus;
  });

  const inp = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500";

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
          <span className="text-blue-600 font-medium border-b-2 border-blue-600 pb-1">Скутери</span>
          <a href="/admin/payments" className="text-slate-500 hover:text-slate-700">Платежі</a>
        </nav>
        <button onClick={() => { sessionStorage.removeItem("admin_auth"); router.push("/admin"); }} className="text-sm text-slate-400 hover:text-slate-600">Вийти</button>
      </header>

      <div className="p-6 flex gap-6">
        <div className="flex-1 min-w-0">
          {/* Filters + Add */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500">
              <option value="all">Всі міста</option>
              {["Луцьк","Рівне","Львів"].map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500">
              <option value="all">Всі статуси</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button onClick={loadScooters} className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50">Оновити</button>
            <button onClick={() => setShowAdd(true)} className="ml-auto px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
              + Додати скутер
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {Object.entries(STATUS).map(([key, val]) => (
              <div key={key} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <div className="text-xl mb-1">{val.icon}</div>
                <div className="text-2xl font-bold text-slate-900">{scooters.filter(s => s.status === key).length}</div>
                <div className="text-xs text-slate-500 mt-1">{val.label}</div>
              </div>
            ))}
          </div>

          {/* Add form */}
          {showAdd && (
            <div className="bg-white rounded-xl border border-blue-200 p-5 mb-4">
              <h3 className="font-semibold text-slate-900 mb-4">Новий скутер</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Назва/номер *</label>
                  <input value={newScooter.name} onChange={e => setNewScooter(p => ({...p, name: e.target.value}))} className={inp} placeholder="Скутер #1"/>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Модель</label>
                  <input value={newScooter.model} onChange={e => setNewScooter(p => ({...p, model: e.target.value}))} className={inp} placeholder="Xiaomi Pro 2"/>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">VIN номер</label>
                  <input value={newScooter.vin} onChange={e => setNewScooter(p => ({...p, vin: e.target.value}))} className={inp} placeholder="ABC123..."/>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Місто</label>
                  <select value={newScooter.city} onChange={e => setNewScooter(p => ({...p, city: e.target.value}))} className={inp}>
                    {["Луцьк","Рівне","Львів"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">GPS трекер ID</label>
                  <input value={newScooter.gps_tracker_id} onChange={e => setNewScooter(p => ({...p, gps_tracker_id: e.target.value}))} className={inp} placeholder="IMEI трекера"/>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Примітки</label>
                  <input value={newScooter.notes} onChange={e => setNewScooter(p => ({...p, notes: e.target.value}))} className={inp} placeholder="Додаткова інформація"/>
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setShowAdd(false)} className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm hover:bg-slate-50">Скасувати</button>
                <button onClick={addScooter} disabled={saving || !newScooter.name} className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                  {saving ? "Збереження..." : "Додати"}
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-slate-400">Завантаження...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <div className="text-4xl mb-3">🛵</div>
                <p>Скутерів ще немає</p>
                <button onClick={() => setShowAdd(true)} className="mt-3 text-blue-600 text-sm hover:underline">Додати перший скутер</button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Скутер</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Місто</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Статус</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Кур'єр</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">GPS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id} onClick={() => setSelected(s)} className={`border-b border-slate-50 cursor-pointer hover:bg-blue-50 transition-colors ${selected?.id === s.id ? "bg-blue-50" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{s.name}</div>
                        <div className="text-slate-400 text-xs">{s.model || s.vin || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.city || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS[s.status || "available"]?.color || "bg-slate-100 text-slate-500"}`}>
                          {STATUS[s.status || "available"]?.icon} {STATUS[s.status || "available"]?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {s.courier ? s.courier.full_name : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                        {s.gps_tracker_id || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-80 shrink-0">
            <div className="bg-white rounded-xl border border-slate-200 p-5 sticky top-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="font-bold text-slate-900">{selected.name}</h2>
                  <p className="text-slate-500 text-sm">{selected.model || "Модель не вказана"}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-300 hover:text-slate-500 text-lg">×</button>
              </div>

              <div className="space-y-2 text-sm mb-4">
                {[
                  ["Місто", selected.city],
                  ["VIN", selected.vin],
                  ["GPS трекер", selected.gps_tracker_id],
                  ["Батарея", selected.battery_level ? `${selected.battery_level}%` : null],
                  ["Примітки", selected.notes],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-2">
                    <span className="text-slate-400 w-24 shrink-0">{label}</span>
                    <span className="text-slate-700 font-medium">{value || "—"}</span>
                  </div>
                ))}
              </div>

              {selected.courier && (
                <div className="bg-blue-50 rounded-xl p-3 mb-4 text-sm">
                  <p className="text-blue-600 font-medium text-xs mb-1">Поточний кур'єр</p>
                  <p className="text-slate-900 font-medium">{selected.courier.full_name}</p>
                  <p className="text-slate-500 text-xs">{selected.courier.phone}</p>
                </div>
              )}

              <div className="border-t border-slate-100 pt-4 mb-4">
                <p className="text-xs text-slate-400 mb-2">Статус</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(STATUS).map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => updateStatus(selected.id, key)}
                      className={`py-2 px-3 rounded-xl text-xs font-medium transition-colors ${selected.status === key ? val.color + " ring-2 ring-offset-1 ring-blue-400" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                    >
                      {val.icon} {val.label}
                    </button>
                  ))}
                </div>
              </div>

              {selected.gps_tracker_id && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-400 mb-2">GPS керування</p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await fetch("/api/gps/block", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ trackerId: selected.gps_tracker_id })
                        });
                        updateStatus(selected.id, "blocked");
                      }}
                      className="flex-1 bg-red-100 text-red-700 rounded-xl py-2 text-xs font-medium hover:bg-red-200"
                    >
                      🔒 Заблокувати
                    </button>
                    <button
                      onClick={async () => {
                        await fetch("/api/gps/unblock", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ trackerId: selected.gps_tracker_id })
                        });
                        updateStatus(selected.id, "available");
                      }}
                      className="flex-1 bg-green-100 text-green-700 rounded-xl py-2 text-xs font-medium hover:bg-green-200"
                    >
                      🔓 Розблокувати
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
