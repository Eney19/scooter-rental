"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getAdminRole, clearAdminRole, type AdminRole } from "@/lib/admin-auth";

type Scooter = {
  id: string;
  name: string;
  model: string | null;
  city: string | null;
  status: string | null;
  gps_tracker_id: string | null;
  gps_device_id: string | null;
  gps_sim_phone: string | null;
  gps_locked: boolean | null;
  gps_locked_at: string | null;
  gps_last_ack_at: string | null;
  gps_last_ack_text: string | null;
  courier_id: string | null;
  courier?: { id: string; full_name: string } | null;
};

type CourierOption = { id: string; full_name: string };

export default function AdminGpsPage() {
  const router = useRouter();
  const [scooters, setScooters] = useState<Scooter[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState("all");
  const [rentalFilter, setRentalFilter] = useState<"all" | "rented" | "available">("all");
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [newScooter, setNewScooter] = useState({
    name: "", city: "Луцьк", gps_tracker_id: "", gps_device_id: "", gps_sim_phone: "", courier_id: ""
  });
  const [courierQuery, setCourierQuery] = useState("");
  const [showCourierOptions, setShowCourierOptions] = useState(false);
  const [role, setRole] = useState<AdminRole | null>(null);

  useEffect(() => {
    async function init() {
      const r = getAdminRole();
      if (!r) {
        router.push("/admin");
        return;
      }
      setRole(r);
      await loadScooters();
      await loadCouriers();
    }
    init();
  }, []);

  async function loadScooters() {
    setLoading(true);
    const { data } = await supabase
      .from("scooters")
      .select("id, name, model, city, status, gps_tracker_id, gps_device_id, gps_sim_phone, gps_locked, gps_locked_at, gps_last_ack_at, gps_last_ack_text, courier_id, courier:couriers(id, full_name)")
      .order("name", { ascending: true });
    setScooters((data || []) as unknown as Scooter[]);
    setLoading(false);
  }

  async function loadCouriers() {
    const { data } = await supabase
      .from("couriers")
      .select("id, full_name")
      .is("deleted_at", null)
      .order("full_name", { ascending: true });
    setCouriers((data || []) as CourierOption[]);
  }

  // Створює новий скутер прямо з вкладки GPS: номер, телефон SIM трекера, ID
  // трекера (IMEI) і одразу кур'єра, який на ньому катається (зі списку
  // існуючих). Якщо обраний кур'єр вже має інший скутер — знімає прив'язку
  // з нього, щоб не лишалось двох скутерів на одному кур'єрі.
  async function addScooter() {
    if (!newScooter.name.trim()) return;
    const courierId = newScooter.courier_id || null;
    if (courierId) {
      const prevScooter = scooters.find(s => s.courier_id === courierId);
      if (prevScooter) {
        const courierName = couriers.find(c => c.id === courierId)?.full_name || "цього кур'єра";
        if (!confirm(`${courierName} вже прив'язаний до "${prevScooter.name}". Перепризначити на новий скутер?`)) return;
      }
    }
    setAddSaving(true);
    const { data, error } = await supabase.from("scooters").insert({
      name: newScooter.name.trim(),
      city: newScooter.city,
      gps_tracker_id: newScooter.gps_tracker_id.trim() || null,
      gps_device_id: newScooter.gps_device_id.trim() || null,
      gps_sim_phone: newScooter.gps_sim_phone.trim() || null,
      courier_id: courierId,
      status: "available",
    }).select().single();
    if (error || !data) {
      setAddSaving(false);
      alert(`Не вдалося додати скутер: ${error?.message || "невідома помилка"}`);
      return;
    }
    if (courierId) {
      const prevScooter = scooters.find(s => s.courier_id === courierId);
      if (prevScooter) {
        await supabase.from("scooters").update({ courier_id: null }).eq("id", prevScooter.id);
      }
    }
    const courierInfo = courierId ? couriers.find(c => c.id === courierId) : null;
    setScooters(prev => {
      const cleared = courierId ? prev.map(s => s.courier_id === courierId ? { ...s, courier_id: null, courier: null } : s) : prev;
      const added: Scooter = {
        ...(data as unknown as Scooter),
        courier_id: courierId,
        courier: courierInfo ? { id: courierInfo.id, full_name: courierInfo.full_name } : null,
      };
      return [...cleared, added].sort((a, b) => a.name.localeCompare(b.name));
    });
    setAddSaving(false);
    setShowAdd(false);
    setNewScooter({ name: "", city: "Луцьк", gps_tracker_id: "", gps_device_id: "", gps_sim_phone: "", courier_id: "" });
    setCourierQuery("");
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
    if (!confirm(`Заблокувати "${s.name}" по GPS? Переконайся, що скутер зараз НЕ в русі. SMS надішлеться автоматично через Android-шлюз.`)) return;
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
    if (!confirm(`Розблокувати "${s.name}" по GPS? SMS надішлеться автоматично через Android-шлюз.`)) return;
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
  const statusFiltered = cityFiltered.filter(s => rentalFilter === "all" || s.status === rentalFilter);
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
          {role === "admin" && (
            <>
              <a href="/admin/scooters" className="text-slate-500 hover:text-slate-700 shrink-0">Скутери</a>
              <a href="/admin/payments" className="text-slate-500 hover:text-slate-700 shrink-0">Платежі</a>
              <a href="/admin/calendar" className="text-slate-500 hover:text-slate-700 shrink-0">Календар</a>
            </>
          )}
          <a href="/admin/queue" className="text-slate-500 hover:text-slate-700 shrink-0">Черга</a>
          <a href="/admin/purchases" className="text-slate-500 hover:text-slate-700 shrink-0">Закупити</a>
          <span className="text-blue-600 font-medium border-b-2 border-blue-600 pb-1 shrink-0">GPS</span>
          <a href="/admin/cash" className="text-slate-500 hover:text-slate-700 shrink-0">Каса</a>
        </nav>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="font-bold text-slate-900">GPS-трекери скутерів</h2>
          <div className="flex items-center gap-3">
            {lockedCount > 0 && (
              <div className="text-sm text-red-600 font-medium">🔒 Заблоковано: {lockedCount}</div>
            )}
            <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
              + Додати скутер
            </button>
          </div>
        </div>

        {showAdd && (
          <div className="bg-white rounded-xl border border-blue-200 p-5 mb-4">
            <h3 className="font-semibold text-slate-900 mb-4">Новий скутер</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Назва/номер *</label>
                <input
                  value={newScooter.name}
                  onChange={e => setNewScooter(p => ({ ...p, name: e.target.value }))}
                  placeholder="Скутер #1"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Місто</label>
                <select
                  value={newScooter.city}
                  onChange={e => setNewScooter(p => ({ ...p, city: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                >
                  {["Луцьк", "Рівне", "Львів"].map(ct => <option key={ct}>{ct}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Телефон SIM трекера</label>
                <input
                  value={newScooter.gps_sim_phone}
                  onChange={e => setNewScooter(p => ({ ...p, gps_sim_phone: e.target.value }))}
                  placeholder="+380XXXXXXXXX"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">IMEI трекера</label>
                <input
                  value={newScooter.gps_tracker_id}
                  onChange={e => setNewScooter(p => ({ ...p, gps_tracker_id: e.target.value }))}
                  placeholder="869343040709846"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">ID трекера (платформа)</label>
                <input
                  value={newScooter.gps_device_id}
                  onChange={e => setNewScooter(p => ({ ...p, gps_device_id: e.target.value }))}
                  placeholder="1980261096"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="sm:col-span-2 relative">
                <label className="text-xs text-slate-500 mb-1 block">Кур&apos;єр, який зараз на ньому катається</label>
                <input
                  value={courierQuery}
                  onChange={e => {
                    setCourierQuery(e.target.value);
                    setNewScooter(p => ({ ...p, courier_id: "" }));
                    setShowCourierOptions(true);
                  }}
                  onFocus={() => setShowCourierOptions(true)}
                  onBlur={() => setTimeout(() => setShowCourierOptions(false), 150)}
                  placeholder="Почніть вводити ім'я..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                />
                {newScooter.courier_id && (
                  <button
                    type="button"
                    onClick={() => { setNewScooter(p => ({ ...p, courier_id: "" })); setCourierQuery(""); }}
                    className="absolute right-3 top-9 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ✕
                  </button>
                )}
                {showCourierOptions && (
                  <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-lg">
                    <div
                      onClick={() => { setNewScooter(p => ({ ...p, courier_id: "" })); setCourierQuery(""); setShowCourierOptions(false); }}
                      className="px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 cursor-pointer"
                    >
                      — Без кур&apos;єра —
                    </div>
                    {couriers
                      .filter(c => c.full_name.toLowerCase().includes(courierQuery.trim().toLowerCase()))
                      .map(c => (
                        <div
                          key={c.id}
                          onClick={() => { setNewScooter(p => ({ ...p, courier_id: c.id })); setCourierQuery(c.full_name); setShowCourierOptions(false); }}
                          className="px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 cursor-pointer"
                        >
                          {c.full_name}
                        </div>
                      ))}
                    {couriers.filter(c => c.full_name.toLowerCase().includes(courierQuery.trim().toLowerCase())).length === 0 && (
                      <div className="px-3 py-2 text-sm text-slate-400">Нікого не знайдено</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setShowAdd(false); setNewScooter({ name: "", city: "Луцьк", gps_tracker_id: "", gps_device_id: "", gps_sim_phone: "", courier_id: "" }); setCourierQuery(""); }}
                className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm hover:bg-slate-50"
              >
                Скасувати
              </button>
              <button
                onClick={addScooter}
                disabled={addSaving || !newScooter.name.trim()}
                className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                {addSaving ? "Збереження..." : "Додати"}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-3 mb-4 flex-wrap items-center">
          <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
            <option value="all">Всі міста</option>
            {["Луцьк","Рівне","Львів"].map(c => <option key={c}>{c}</option>)}
          </select>
          <button
            onClick={() => setRentalFilter(f => f === "rented" ? "all" : "rented")}
            className={`px-3 py-2 rounded-xl text-sm font-medium border ${rentalFilter === "rented" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200 hover:text-slate-700"}`}
          >
            🛵 В оренді
          </button>
          <button
            onClick={() => setRentalFilter(f => f === "available" ? "all" : "available")}
            className={`px-3 py-2 rounded-xl text-sm font-medium border ${rentalFilter === "available" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200 hover:text-slate-700"}`}
          >
            🅿️ Вільні
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
                        {s.gps_last_ack_at && (
                          <div className="text-slate-400 text-[11px] mt-1">
                            Трекер: «{s.gps_last_ack_text}» {new Date(s.gps_last_ack_at).toLocaleString("uk-UA")}
                          </div>
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
