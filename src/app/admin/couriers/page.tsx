"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { getBatteryLabels } from "@/lib/pricing";

type Courier = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  city: string | null;
  status: string | null;
  contract_signed_at: string | null;
  contract_pdf_url: string | null;
  tax_id: string | null;
  passport_series: string | null;
  address: string | null;
  weekly_price: number | null;
  scooter_model: string | null;
  created_at: string;
  subscription_start_date: string | null;
  return_pdf_url: string | null;
  return_signed_at: string | null;
  debt_since: string | null;
  debt_amount: number | null;
  debt_auto: boolean | null;
  registration_step: number | null;
  registration_attempts: number | null;
  battery_types: string[] | null;
  last_cabinet_login_at: string | null;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:   { label: "Активний",  color: "bg-green-100 text-green-700" },
  pending:  { label: "Очікує",    color: "bg-yellow-100 text-yellow-700" },
  inactive: { label: "Неактивний",color: "bg-slate-100 text-slate-500" },
  debtor:   { label: "Боржник",   color: "bg-red-100 text-red-700" },
};

const REGISTRATION_STEP_LABELS: Record<number, string> = {
  1: "контактні дані",
  2: "документи",
  3: "очікує оплату",
};

type SubInfo = { id: string; expires_at: string; paid_at: string | null; amount: number };
type PaymentRecord = { id: string; amount: number; deposit: number | null; battery_amount: number | null; wayforpay_id: string | null; created_at: string };

function weeksWord(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "тиждень";
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "тижні";
  return "тижнів";
}

// Скільки повних тижнів наперед оплачено, рахуючи від зараз до expires_at
// (1 = оплачено лише поточний тиждень, 2+ = є оплата наперед).
function weeksAheadPaid(expiresAt: string): number {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 7));
}

export default function AdminCouriersPage() {
  const router = useRouter();
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Courier | null>(null);
  const [showReturnQR, setShowReturnQR] = useState(false);
  const [showReturnOptions, setShowReturnOptions] = useState(false);
  const [returnLoading, setReturnLoading] = useState(false);
  const [deletingIncomplete, setDeletingIncomplete] = useState(false);
  const [cashPaymentLoading, setCashPaymentLoading] = useState(false);
  const [telegramPrompt, setTelegramPrompt] = useState<{ name: string; phone: string; botUsername: string; amount: number } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [docFiles, setDocFiles] = useState<Record<string, string>>({});
  const [docFilesLoading, setDocFilesLoading] = useState(false);
  const [subsByCourier, setSubsByCourier] = useState<Record<string, SubInfo>>({});
  const [courierPayments, setCourierPayments] = useState<PaymentRecord[]>([]);
  const [courierPaymentsLoading, setCourierPaymentsLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("admin_auth") !== "true") {
      router.push("/admin");
      return;
    }
    loadCouriers();
  }, []);

  async function loadCouriers() {
    setLoading(true);
    const { data } = await supabase
      .from("couriers")
      .select("*")
      .order("created_at", { ascending: false });
    setCouriers(data || []);

    const { data: subs } = await supabase
      .from("subscriptions")
      .select("id, courier_id, expires_at, paid_at, amount")
      .eq("status", "active");
    const map: Record<string, SubInfo> = {};
    (subs || []).forEach((s) => {
      map[s.courier_id] = { id: s.id, expires_at: s.expires_at, paid_at: s.paid_at, amount: s.amount };
    });
    setSubsByCourier(map);

    setLoading(false);
  }

  function selectCourier(c: Courier | null) {
    setSelected(c);
    setShowReturnQR(false);
    setShowReturnOptions(false);
    setDocFiles({});
    setCourierPayments([]);
    if (c) {
      loadDocFiles(c.id);
      loadCourierPayments(c.id);
    }
  }

  async function loadCourierPayments(courierId: string) {
    setCourierPaymentsLoading(true);
    const { data } = await supabase
      .from("payments")
      .select("id, amount, deposit, battery_amount, wayforpay_id, created_at")
      .eq("courier_id", courierId)
      .eq("status", "success")
      .order("created_at", { ascending: false });
    setCourierPayments(data || []);
    setCourierPaymentsLoading(false);
  }

  async function loadDocFiles(courierId: string) {
    setDocFilesLoading(true);
    const { data } = await supabaseAdmin.storage.from("documents").list(courierId, { limit: 100 });
    const found: Record<string, string> = {};
    for (const kind of ["passport", "propiska", "rnokpp"]) {
      const match = data?.find(f => f.name.startsWith(`${kind}.`));
      if (match) found[kind] = match.name;
    }
    setDocFiles(found);
    setDocFilesLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from("couriers").update({ status }).eq("id", id);
    setCouriers(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null);
  }

  async function updateSubscriptionStart(id: string, date: string) {
    const value = date || null;
    await supabase.from("couriers").update({ subscription_start_date: value }).eq("id", id);
    setCouriers(prev => prev.map(c => c.id === id ? { ...c, subscription_start_date: value } : c));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, subscription_start_date: value } : null);
  }

  async function updateSubscriptionDate(courierId: string, subId: string, field: "paid_at" | "expires_at", date: string) {
    const value = date || null;
    const { error } = await supabase.from("subscriptions").update({ [field]: value }).eq("id", subId);
    if (error) {
      console.error(`updateSubscriptionDate(${field}) failed`, error);
      alert(`Не вдалося зберегти дату: ${error.message}`);
      return;
    }
    setSubsByCourier(prev => {
      const current = prev[courierId];
      if (!current) return prev;
      return { ...prev, [courierId]: { ...current, [field]: value as string } };
    });
  }

  async function updateDebtSince(id: string, date: string) {
    const value = date || null;
    await supabase.from("couriers").update({ debt_since: value, debt_auto: false }).eq("id", id);
    setCouriers(prev => prev.map(c => c.id === id ? { ...c, debt_since: value, debt_auto: false } : c));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, debt_since: value, debt_auto: false } : null);
  }

  async function saveDebtAmount(id: string, value: string) {
    const num = value.trim() === "" ? null : Number(value);
    const { error } = await supabase.from("couriers").update({ debt_amount: num, debt_auto: false }).eq("id", id);
    if (error) {
      console.error("saveDebtAmount failed", error);
      alert(`Не вдалося зберегти суму боргу: ${error.message}`);
      return;
    }
    setCouriers(prev => prev.map(c => c.id === id ? { ...c, debt_amount: num, debt_auto: false } : c));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, debt_amount: num, debt_auto: false } : null);
  }

  function handleFieldChange(field: keyof Courier, value: string) {
    setSelected(prev => prev ? ({ ...prev, [field]: value } as Courier) : null);
  }

  async function saveField(id: string, field: string, value: string) {
    const trimmed = value.trim() || null;
    const { error } = await supabase.from("couriers").update({ [field]: trimmed }).eq("id", id);
    if (error) {
      console.error(`saveField(${field}) failed`, error);
      alert(`Не вдалося зберегти поле "${field}": ${error.message}`);
      return;
    }
    setCouriers(prev => prev.map(c => c.id === id ? ({ ...c, [field]: trimmed } as Courier) : c));
  }

  async function saveNumberField(id: string, field: string, value: string) {
    const num = value.trim() === "" ? null : Number(value);
    const { error } = await supabase.from("couriers").update({ [field]: num }).eq("id", id);
    if (error) {
      console.error(`saveNumberField(${field}) failed`, error);
      alert(`Не вдалося зберегти поле "${field}": ${error.message}`);
      return;
    }
    setCouriers(prev => prev.map(c => c.id === id ? ({ ...c, [field]: num } as Courier) : c));
    if (selected?.id === id) setSelected(prev => prev ? ({ ...prev, [field]: num } as Courier) : null);
  }

  async function handleCashPayment(courierId: string) {
    if (!confirm("Підтвердити готівкову оплату? Підписка продовжиться на 7 днів.")) return;
    setCashPaymentLoading(true);
    try {
      const res = await fetch("/api/admin/cash-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierId }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || "Не вдалося записати оплату");
        return;
      }
      if (!data.telegramLinked) {
        setTelegramPrompt({
          name: selected?.full_name || "",
          phone: selected?.phone || "",
          botUsername: data.botUsername,
          amount: data.amount,
        });
      } else {
        alert(`Готівковий платіж записано: ${data.amount} грн`);
      }
      await loadCouriers();
    } catch (e) {
      console.error(e);
      alert("Помилка мережі. Спробуйте ще раз");
    } finally {
      setCashPaymentLoading(false);
    }
  }
  function handleReturnScooter() {
    if (!selected) return;
    setShowReturnOptions(true);
  }

  function handleReturnWithAct() {
    if (!selected) return;
    setShowReturnOptions(false);
    setShowReturnQR(true);
  }

  async function handleReturnWithoutAct() {
    if (!selected) return;
    if (!confirm(`Здати скутер без підпису Акту передачі для ${selected.full_name}? Статус кур'єра одразу стане "Неактивний".`)) {
      return;
    }
    setReturnLoading(true);
    try {
      const res = await fetch("/api/admin/scooter-return-no-act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierId: selected.id }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || "Не вдалося здати скутер");
        return;
      }
      setShowReturnOptions(false);
      await loadCouriers();
    } catch (e) {
      console.error(e);
      alert("Помилка мережі. Спробуйте ще раз");
    } finally {
      setReturnLoading(false);
    }
  }

  async function handleDeleteIncomplete() {
    if (!selected) return;
    if (!confirm(`Видалити незавершену реєстрацію "${selected.full_name}" (${selected.phone})? Договір ще не підписано, тож дію можна виконати безпечно.`)) {
      return;
    }
    setDeletingIncomplete(true);
    try {
      const res = await fetch("/api/admin/delete-incomplete-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierId: selected.id }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || "Не вдалося видалити реєстрацію");
        return;
      }
      selectCourier(null);
      await loadCouriers();
    } catch (e) {
      console.error(e);
      alert("Помилка мережі. Спробуйте ще раз");
    } finally {
      setDeletingIncomplete(false);
    }
  }

  const filtered = couriers.filter(c => {
    const matchSearch = !search ||
      c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search);
    const matchCity = cityFilter === "all" || c.city === cityFilter;
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchCity && matchStatus;
  });

  const cities = ["all", "Луцьк", "Рівне", "Львів"];

  const fieldInputClass = "flex-1 min-w-0 text-slate-700 font-medium bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-500 focus:outline-none px-0 py-0.5";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm">⚡</span>
          </div>
          <h1 className="text-lg font-bold text-slate-900">PowerDrive Admin</h1>
        </div>
        <nav className="flex gap-4 text-sm">
          <span className="text-blue-600 font-medium border-b-2 border-blue-600 pb-1">Кур'єри</span>
          <a href="/admin/scooters" className="text-slate-500 hover:text-slate-700">Скутери</a>
          <a href="/admin/payments" className="text-slate-500 hover:text-slate-700">Платежі</a>
          <a href="/admin/calendar" className="text-slate-500 hover:text-slate-700">Календар</a>
        </nav>
        <button
          onClick={() => { sessionStorage.removeItem("admin_auth"); router.push("/admin"); }}
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          Вийти
        </button>
      </header>

      <div className="p-6 flex gap-6">
        {/* Left: list */}
        <div className="flex-1 min-w-0">
          {/* Filters */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Пошук за ім'ям або телефоном..."
              className="flex-1 min-w-48 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            />
            <select
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="all">Всі міста</option>
              {["Луцьк","Рівне","Львів"].map(c => <option key={c}>{c}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="all">Всі статуси</option>
              <option value="active">Активні</option>
              <option value="pending">Очікують</option>
              <option value="inactive">Неактивні</option>
              <option value="debtor">Боржники</option>
            </select>
            <button onClick={loadCouriers} className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
              Оновити
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "Всього", value: couriers.length, color: "text-slate-900" },
              { label: "Активних", value: couriers.filter(c => c.status === "active").length, color: "text-green-600" },
              { label: "Очікують", value: couriers.filter(c => !c.status || c.status === "pending").length, color: "text-yellow-600" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-slate-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-slate-400">Завантаження...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-slate-400">Кур'єрів не знайдено</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Кур'єр</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Місто</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Модель електроскутера / Тариф</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Статус</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Борг</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Договір</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr
                      key={c.id}
                      onClick={() => selectCourier(c)}
                      className={`border-b border-slate-50 cursor-pointer hover:bg-blue-50 transition-colors ${selected?.id === c.id ? "bg-blue-50" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{c.full_name}</div>
                        <div className="text-slate-400 text-xs">{c.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{c.city || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="text-slate-600">{c.scooter_model || "—"}</div>
                        <div className="text-slate-400 text-xs">{c.weekly_price ? `${c.weekly_price} грн/тиж` : "—"}</div>
                        {getBatteryLabels(c.battery_types).length > 0 && (
                          <div className="text-blue-500 text-[11px] mt-0.5">🔋 {getBatteryLabels(c.battery_types).join(", ")}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_LABELS[c.status || "pending"]?.color || "bg-yellow-100 text-yellow-700"}`}>
                          {STATUS_LABELS[c.status || "pending"]?.label || "Очікує"}
                        </span>
                        {(c.status || "pending") === "pending" && (
                          <div className="text-slate-400 text-[11px] mt-1">
                            {REGISTRATION_STEP_LABELS[c.registration_step ?? 3] || "очікує оплату"}
                            {c.registration_attempts && c.registration_attempts > 1 ? ` · спроба ${c.registration_attempts}` : ""}
                          </div>
                        )}
                        {subsByCourier[c.id] && (() => {
                          const sub = subsByCourier[c.id];
                          const weeks = weeksAheadPaid(sub.expires_at);
                          const dateStr = new Date(sub.expires_at).toLocaleDateString("uk-UA");
                          if (weeks <= 0) {
                            return <div className="text-red-500 text-[11px] mt-1">Прострочено з {dateStr}</div>;
                          }
                          return (
                            <div className="text-[11px] mt-1">
                              <span className="text-slate-400">Оплачено до {dateStr}</span>
                              {weeks >= 2 && (
                                <span className="ml-1 text-emerald-600 font-medium">· +{weeks - 1} {weeksWord(weeks - 1)} наперед</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {c.debt_amount ? (
                          <span className="font-semibold text-red-600">{c.debt_amount.toLocaleString("uk-UA")} грн</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {c.contract_pdf_url ? (
                          <a href={c.contract_pdf_url} target="_blank" onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline text-xs">
                            📄 PDF
                          </a>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {new Date(c.created_at).toLocaleDateString("uk-UA")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: detail panel */}
        {selected && (
          <div className="w-80 shrink-0">
            <div className="bg-white rounded-xl border border-slate-200 p-5 sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={selected.full_name}
                    onChange={e => handleFieldChange("full_name", e.target.value)}
                    onBlur={e => saveField(selected.id, "full_name", e.target.value)}
                    className="font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-500 focus:outline-none w-full px-0 py-0.5"
                  />
                  <p className="text-slate-500 text-sm">{selected.phone}</p>
                </div>
                <button onClick={() => selectCourier(null)} className="text-slate-300 hover:text-slate-500 text-lg">×</button>
              </div>

              {(selected.status || "pending") === "pending" && (selected.registration_step ?? 3) < 3 && (
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 mb-4">
                  <p className="text-xs text-amber-700 mb-2">
                    Реєстрацію не завершено: зупинився на кроці «{REGISTRATION_STEP_LABELS[selected.registration_step ?? 1]}»
                    {selected.registration_attempts && selected.registration_attempts > 1 ? ` (спроб: ${selected.registration_attempts})` : ""}.
                    Договір ще не підписано.
                  </p>
                  <button
                    onClick={handleDeleteIncomplete}
                    disabled={deletingIncomplete}
                    className="text-xs font-medium text-amber-700 border border-amber-300 rounded-lg px-3 py-1.5 hover:bg-amber-100 disabled:opacity-60"
                  >
                    {deletingIncomplete ? "Видалення..." : "🗑 Видалити незавершену реєстрацію"}
                  </button>
                </div>
              )}

              <div className="space-y-2 text-sm mb-4">
                <div className="flex gap-2 items-center">
                  <span className="text-slate-400 w-20 shrink-0">Email</span>
                  <input
                    type="email"
                    value={selected.email || ""}
                    placeholder="email@example.com"
                    onChange={e => handleFieldChange("email", e.target.value)}
                    onBlur={e => saveField(selected.id, "email", e.target.value)}
                    className={fieldInputClass}
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-slate-400 w-20 shrink-0">Місто</span>
                  <select
                    value={selected.city || ""}
                    onChange={e => { handleFieldChange("city", e.target.value); saveField(selected.id, "city", e.target.value); }}
                    className={fieldInputClass}
                  >
                    <option value="">—</option>
                    {["Луцьк", "Рівне", "Львів"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-slate-400 w-20 shrink-0">Адреса</span>
                  <input
                    type="text"
                    value={selected.address || ""}
                    placeholder="Адреса"
                    onChange={e => handleFieldChange("address", e.target.value)}
                    onBlur={e => saveField(selected.id, "address", e.target.value)}
                    className={fieldInputClass}
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-slate-400 w-20 shrink-0">Тариф</span>
                  <input
                    type="number"
                    value={selected.weekly_price ?? ""}
                    placeholder="грн/тиж"
                    onChange={e => handleFieldChange("weekly_price", e.target.value)}
                    onBlur={e => saveNumberField(selected.id, "weekly_price", e.target.value)}
                    className={fieldInputClass}
                  />
                  <span className="text-slate-400 text-xs shrink-0">грн/тиж</span>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-slate-400 w-28 shrink-0 text-xs leading-tight">Модель електроскутера</span>
                  <input
                    type="text"
                    value={selected.scooter_model || ""}
                    placeholder="Модель електроскутера"
                    onChange={e => handleFieldChange("scooter_model", e.target.value)}
                    onBlur={e => saveField(selected.id, "scooter_model", e.target.value)}
                    className={fieldInputClass}
                  />
                </div>
                {getBatteryLabels(selected.battery_types).length > 0 && (
                  <div className="flex gap-2 items-center">
                    <span className="text-slate-400 w-28 shrink-0 text-xs leading-tight">Акумулятор</span>
                    <span className="text-slate-700 text-sm">🔋 {getBatteryLabels(selected.battery_types).join(", ")}</span>
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <span className="text-slate-400 w-20 shrink-0">РНОКПП</span>
                  <input
                    type="text"
                    value={selected.tax_id || ""}
                    placeholder="1234567890"
                    onChange={e => handleFieldChange("tax_id", e.target.value.replace(/\D/g, "").slice(0, 10))}
                    onBlur={e => saveField(selected.id, "tax_id", e.target.value)}
                    className={fieldInputClass}
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-slate-400 w-20 shrink-0">Паспорт</span>
                  <input
                    type="text"
                    value={selected.passport_series || ""}
                    placeholder="АА 123456"
                    onChange={e => handleFieldChange("passport_series", e.target.value)}
                    onBlur={e => saveField(selected.id, "passport_series", e.target.value)}
                    className={fieldInputClass}
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-slate-400 w-20 shrink-0">Договір</span>
                  <input
                    type="text"
                    value={selected.contract_pdf_url || ""}
                    placeholder="Посилання на PDF договору"
                    onChange={e => handleFieldChange("contract_pdf_url", e.target.value)}
                    onBlur={e => saveField(selected.id, "contract_pdf_url", e.target.value)}
                    className={fieldInputClass + " truncate"}
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 mb-4">
                <p className="text-xs text-slate-400 mb-2">Статус</p>
                <div className="flex gap-2">
                  {["active", "pending", "inactive", "debtor"].map(s => (
                    <button
                      key={s}
                      onClick={() => updateStatus(selected.id, s)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${selected.status === s ? STATUS_LABELS[s].color + " ring-2 ring-offset-1 ring-blue-400" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                    >
                      {STATUS_LABELS[s].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 mb-4">
                <p className="text-xs text-slate-400 mb-2">Підписка</p>
                {subsByCourier[selected.id] ? (() => {
                  const sub = subsByCourier[selected.id];
                  const weeks = weeksAheadPaid(sub.expires_at);
                  const dateStr = new Date(sub.expires_at).toLocaleDateString("uk-UA");
                  return (
                    <div className="text-sm space-y-2">
                      <div className="flex gap-2 items-center">
                        <span className="text-slate-400 w-24 shrink-0 text-xs">Оплата з</span>
                        <input
                          type="date"
                          value={sub.paid_at ? sub.paid_at.slice(0, 10) : ""}
                          onChange={e => updateSubscriptionDate(selected.id, sub.id, "paid_at", e.target.value)}
                          className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="text-slate-400 w-24 shrink-0 text-xs">Оплата до</span>
                        <input
                          type="date"
                          value={sub.expires_at ? sub.expires_at.slice(0, 10) : ""}
                          onChange={e => updateSubscriptionDate(selected.id, sub.id, "expires_at", e.target.value)}
                          className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      {weeks <= 0 ? (
                        <p className="text-red-600 font-medium">⚠️ Прострочено з {dateStr}</p>
                      ) : weeks >= 2 ? (
                        <p className="text-emerald-600 font-medium text-xs">Це і {weeks - 1} {weeksWord(weeks - 1)} наперед</p>
                      ) : null}
                      <p className="text-slate-400 text-xs">Сума останньої оплати: {sub.amount} грн</p>
                    </div>
                  );
                })() : (
                  <p className="text-slate-300 text-sm">Немає активної підписки</p>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4 mb-4">
                <p className="text-xs text-slate-400 mb-2">Історія платежів</p>
                {courierPaymentsLoading ? (
                  <p className="text-slate-300 text-sm">Завантаження...</p>
                ) : courierPayments.length === 0 ? (
                  <p className="text-slate-300 text-sm">Платежів ще немає</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {courierPayments.map((p) => {
                      const deposit = p.deposit || 0;
                      const batteryAmount = p.battery_amount || 0;
                      const scooterAmount = p.amount - deposit - batteryAmount;
                      const hasBreakdown = deposit > 0 || batteryAmount > 0;
                      return (
                        <div key={p.id} className="flex items-center justify-between text-sm border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                          <div>
                            <p className="font-medium text-slate-900">{new Date(p.created_at).toLocaleDateString("uk-UA")}</p>
                            <p className="text-slate-400 text-xs">
                              {p.wayforpay_id?.startsWith("cash_") ? "💵 Готівка" : p.wayforpay_id ? "💳 Онлайн" : "—"}
                            </p>
                            {hasBreakdown && (
                              <p className="text-slate-400 text-xs">
                                {scooterAmount} грн оренда скутера
                                {batteryAmount > 0 && ` + ${batteryAmount} грн оренда акумулятора`}
                                {deposit > 0 && ` + ${deposit} грн завдаток за скутер`}
                              </p>
                            )}
                          </div>
                          <p className="font-semibold text-slate-900">{p.amount} грн</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4 mb-4">
                <p className="text-xs text-slate-400 mb-2">Заборгованість</p>
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <span className="text-slate-400 w-24 shrink-0 text-xs">Боржник з</span>
                    <input
                      type="date"
                      value={selected.debt_since ? selected.debt_since.slice(0, 10) : ""}
                      onChange={e => updateDebtSince(selected.id, e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-slate-400 w-24 shrink-0 text-xs">Сума боргу</span>
                    <input
                      type="number"
                      value={selected.debt_amount ?? ""}
                      placeholder="0"
                      onChange={e => handleFieldChange("debt_amount" as keyof Courier, e.target.value)}
                      onBlur={e => saveDebtAmount(selected.id, e.target.value)}
                      className={fieldInputClass}
                    />
                    <span className="text-slate-400 text-xs shrink-0">грн</span>
                  </div>
                  {selected.debt_auto && (
                    <p className="text-[11px] text-slate-400">
                      Рахується автоматично: +{150} грн/день, поки борг не погашено. Зміните значення вручну — і автонарахування для цього кур'єра зупиниться.
                    </p>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 mb-4">
                <p className="text-xs text-slate-400 mb-2">Дата старту підписки</p>
                <input
                  type="date"
                  value={selected.subscription_start_date ? selected.subscription_start_date.slice(0, 10) : ""}
                  onChange={e => updateSubscriptionStart(selected.id, e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              {selected.contract_pdf_url && (
                <a
                  href={selected.contract_pdf_url}
                  target="_blank"
                  className="block w-full text-center bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 mb-2"
                >
                  📄 Переглянути договір
                </a>
              )}

              {selected.return_pdf_url && (
                <a
                  href={selected.return_pdf_url}
                  target="_blank"
                  className="block w-full text-center border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 mb-2"
                >
                  📄 Акт повернення
                </a>
              )}

              {showReturnQR && (
                <div className="border border-slate-200 rounded-xl p-4 mb-2 text-center bg-slate-50">
                  <p className="text-xs text-slate-500 mb-3">Кур'єр сканує QR-код і підписує акт повернення</p>
                  <div className="flex justify-center mb-3">
                    <QRCodeSVG
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}/return/${selected.id}`}
                      size={160}
                    />
                  </div>
                  <button
                    onClick={() => setShowReturnQR(false)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Сховати QR-код
                  </button>
                </div>
              )}

              <button
                onClick={() => handleCashPayment(selected.id)}
                disabled={cashPaymentLoading}
                className="block w-full text-center bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 mb-2"
              >
                {cashPaymentLoading ? "Обробка..." : "💵 Оплачено готівкою"}
              </button>

              {showReturnOptions && (
                <div className="border border-slate-200 rounded-xl p-3 mb-2 bg-slate-50 space-y-2">
                  <p className="text-xs text-slate-500 mb-1">Оберіть спосіб здачі скутера:</p>
                  <button
                    onClick={handleReturnWithAct}
                    className="block w-full text-center bg-orange-500 text-white rounded-xl py-2 text-sm font-medium hover:bg-orange-600"
                  >
                    📝 Здача з підписом Акту Передачі
                  </button>
                  <button
                    onClick={handleReturnWithoutAct}
                    disabled={returnLoading}
                    className="block w-full text-center border border-orange-300 text-orange-600 rounded-xl py-2 text-sm font-medium hover:bg-orange-50 disabled:opacity-60"
                  >
                    {returnLoading ? "Обробка..." : "Здача без підпису Акту Передачі"}
                  </button>
                  <button
                    onClick={() => setShowReturnOptions(false)}
                    className="block w-full text-center text-xs text-slate-400 hover:text-slate-600 pt-1"
                  >
                    Скасувати
                  </button>
                </div>
              )}

              <button
                onClick={handleReturnScooter}
                className="block w-full text-center bg-orange-500 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-orange-600 mb-2"
              >
                🛴 Здача скутера
              </button>

              <div className="grid grid-cols-3 gap-2">
                {([
                  ["passport", "📎 Паспорт"],
                  ["propiska", "📎 Прописка"],
                  ["rnokpp", "📎 РНОКПП"],
                ] as const).map(([kind, label]) => {
                  const fileName = docFiles[kind];
                  if (fileName) {
                    return (
                      <a
                        key={kind}
                        href={`https://jaenpkdnhlcpyyzwlqui.supabase.co/storage/v1/object/public/documents/${selected.id}/${fileName}`}
                        target="_blank"
                        className="block text-center border border-slate-200 text-slate-600 rounded-xl py-2 text-xs font-medium hover:bg-slate-50"
                      >
                        {label}
                      </a>
                    );
                  }
                  return (
                    <span
                      key={kind}
                      title={docFilesLoading ? "Завантаження..." : "Документ не знайдено"}
                      className="block text-center border border-slate-100 text-slate-300 rounded-xl py-2 text-xs font-medium cursor-not-allowed"
                    >
                      {label}
                    </span>
                  );
                })}
              </div>

              <p className="text-xs text-slate-400 text-center mt-3">
                Зареєстрований: {new Date(selected.created_at).toLocaleDateString("uk-UA")}
                {selected.contract_signed_at && (
                  <><br/>Договір: {new Date(selected.contract_signed_at).toLocaleDateString("uk-UA")}</>
                )}
                {selected.return_signed_at && (
                  <><br/>Повернення: {new Date(selected.return_signed_at).toLocaleDateString("uk-UA")}</>
                )}
                <br/>Останній вхід у кабінет: {selected.last_cabinet_login_at
                  ? new Date(selected.last_cabinet_login_at).toLocaleString("uk-UA")
                  : "ще не заходив(ла)"}
              </p>
            </div>
          </div>
        )}
      </div>

      {telegramPrompt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="text-3xl mb-2">💵📵</div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Платіж записано: {telegramPrompt.amount} грн
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {telegramPrompt.name || "Кур'єр"} ще не підключений до Telegram-бота.
              Надішліть йому посилання, щоб він отримував підтвердження й нагадування.
            </p>

            <div className="bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-700 mb-3 break-all">
              https://t.me/{telegramPrompt.botUsername}
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`https://t.me/${telegramPrompt.botUsername}`);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-2.5 text-sm font-medium"
              >
                {linkCopied ? "✅ Скопійовано" : "📋 Скопіювати посилання"}
              </button>

              {telegramPrompt.phone && (
                <a
                  href={`sms:${telegramPrompt.phone}?body=${encodeURIComponent(
                    `Оплату отримано! Приєднайтесь до нашого Telegram-бота, щоб отримувати підтвердження та нагадування: https://t.me/${telegramPrompt.botUsername}`
                  )}`}
                  className="w-full text-center bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-medium"
                >
                  💬 Надіслати SMS
                </a>
              )}

              <button
                onClick={() => setTelegramPrompt(null)}
                className="w-full text-slate-400 hover:text-slate-600 text-sm py-1"
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
