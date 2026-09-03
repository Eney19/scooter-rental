"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { supabase, supabaseAdmin } from "@/lib/supabase";

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
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:   { label: "Активний",  color: "bg-green-100 text-green-700" },
  pending:  { label: "Очікує",    color: "bg-yellow-100 text-yellow-700" },
  inactive: { label: "Неактивний",color: "bg-slate-100 text-slate-500" },
};

export default function AdminCouriersPage() {
  const router = useRouter();
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Courier | null>(null);
  const [showReturnQR, setShowReturnQR] = useState(false);
  const [cashPaymentLoading, setCashPaymentLoading] = useState(false);
  const [docFiles, setDocFiles] = useState<Record<string, string>>({});
  const [docFilesLoading, setDocFilesLoading] = useState(false);

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
    setLoading(false);
  }

  function selectCourier(c: Courier | null) {
    setSelected(c);
    setShowReturnQR(false);
    setDocFiles({});
    if (c) loadDocFiles(c.id);
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
        alert(
          `Готівковий платіж записано: ${data.amount} грн\n\n` +
          `Кур'єр ще не підключений до Telegram-бота — надішліть йому посилання:\n` +
          `https://t.me/${data.botUsername}`
        );
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
    if (!confirm(`Ініціювати здачу скутера для ${selected.full_name}? Кур'єру потрібно буде відсканувати QR-код і підписати акт повернення.`)) {
      return;
    }
    setShowReturnQR(true);
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
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_LABELS[c.status || "pending"]?.color || "bg-yellow-100 text-yellow-700"}`}>
                          {STATUS_LABELS[c.status || "pending"]?.label || "Очікує"}
                        </span>
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
            <div className="bg-white rounded-xl border border-slate-200 p-5 sticky top-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="font-bold text-slate-900">{selected.full_name}</h2>
                  <p className="text-slate-500 text-sm">{selected.phone}</p>
                </div>
                <button onClick={() => selectCourier(null)} className="text-slate-300 hover:text-slate-500 text-lg">×</button>
              </div>

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
                  {["active", "pending", "inactive"].map(s => (
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
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
