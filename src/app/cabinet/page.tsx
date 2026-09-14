"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BATTERY_OPTIONS, getBatteryWeeklyPrice } from "@/lib/pricing";

const inp = "w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-slate-900";
const lbl = "block text-sm font-medium text-slate-700 mb-1";
const CITIES = ["Луцьк", "Рівне", "Львів"];
const SCOOTER_MODELS = ["FADA Flit II", "Aima u1s", "Dominator A-9", "Crosser CR 21 Tank"];
const PRICE_OPTIONS = ["1750", "2100", "2400", "2800"];

type Courier = {
  id: string;
  full_name: string;
  phone: string;
  city: string | null;
  status: string | null;
  weekly_price: number | null;
  scooter_model: string | null;
  battery_types: string[] | null;
  contract_pdf_url: string | null;
  contract_signed_at: string | null;
  return_pdf_url: string | null;
  return_signed_at: string | null;
  debt_since: string | null;
  debt_amount: number | null;
  debt_auto: boolean | null;
};

type Subscription = {
  status: string;
  expires_at: string;
  amount: number;
  paid_at: string | null;
} | null;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Активний", color: "bg-green-100 text-green-700" },
  pending: { label: "Очікує", color: "bg-yellow-100 text-yellow-700" },
  inactive: { label: "Неактивний", color: "bg-slate-100 text-slate-500" },
  debtor: { label: "Боржник", color: "bg-red-100 text-red-700" },
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("uk-UA");
}

export default function CabinetPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [courier, setCourier] = useState<Courier | null>(null);
  const [subscription, setSubscription] = useState<Subscription>(null);

  const [showReactivate, setShowReactivate] = useState(false);
  const [city, setCity] = useState("Луцьк");
  const [priceOption, setPriceOption] = useState("2400");
  const [customPrice, setCustomPrice] = useState("");
  const [scooterModel, setScooterModel] = useState(SCOOTER_MODELS[0]);
  const [batteries, setBatteries] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [showPayAdvance, setShowPayAdvance] = useState(false);
  const [payAdvanceSubmitting, setPayAdvanceSubmitting] = useState<"online" | "cash" | null>(null);
  const [payAdvanceError, setPayAdvanceError] = useState<string | null>(null);
  const [cashAdvanceRequested, setCashAdvanceRequested] = useState(false);

  function toggleBattery(id: string) {
    setBatteries((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  }

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/cabinet/me");
      if (res.status === 401) {
        router.push("/cabinet/login");
        return;
      }
      const data = await res.json();
      if (data.success) {
        setCourier(data.courier);
        setSubscription(data.subscription);
        if (data.courier.city) setCity(data.courier.city);
        if (data.courier.scooter_model && SCOOTER_MODELS.includes(data.courier.scooter_model)) {
          setScooterModel(data.courier.scooter_model);
        }
        if (data.courier.weekly_price) {
          const priceStr = String(data.courier.weekly_price);
          if (PRICE_OPTIONS.includes(priceStr)) {
            setPriceOption(priceStr);
          } else {
            setPriceOption("");
            setCustomPrice(priceStr);
          }
        }
        if (Array.isArray(data.courier.battery_types)) {
          setBatteries(data.courier.battery_types);
        }
      }
      setLoading(false);
    }
    load();
  }, [router]);

  async function submitReactivate() {
    if (!courier) return;
    const price = customPrice || priceOption;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/cabinet/reactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, weeklyPrice: price, scooterModel, batteryTypes: batteries }),
      });
      const data = await res.json();
      if (!data.success) {
        setFormError(data.error || "Помилка. Спробуйте ще раз");
        return;
      }
      router.push(`/payment/${courier.id}`);
    } catch {
      setFormError("Помилка з'єднання");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveAdvancePlan(): Promise<boolean> {
    if (!courier) return false;
    const price = customPrice || priceOption;
    const res = await fetch("/api/cabinet/update-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weeklyPrice: price, scooterModel, batteryTypes: batteries }),
    });
    const data = await res.json();
    if (!data.success) {
      setPayAdvanceError(data.error || "Помилка. Спробуйте ще раз");
      return false;
    }
    return true;
  }

  async function payAdvanceOnline() {
    if (!courier) return;
    setPayAdvanceSubmitting("online");
    setPayAdvanceError(null);
    try {
      const ok = await saveAdvancePlan();
      if (!ok) return;
      router.push(`/payment/${courier.id}`);
    } catch {
      setPayAdvanceError("Помилка з'єднання");
    } finally {
      setPayAdvanceSubmitting(null);
    }
  }

  async function payAdvanceCash() {
    if (!courier) return;
    setPayAdvanceSubmitting("cash");
    setPayAdvanceError(null);
    try {
      const ok = await saveAdvancePlan();
      if (!ok) return;
      const res = await fetch("/api/cash-payment-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierId: courier.id }),
      });
      const data = await res.json();
      if (!data.success) {
        setPayAdvanceError(data.error || "Помилка. Спробуйте ще раз");
        return;
      }
      setCashAdvanceRequested(true);
    } catch {
      setPayAdvanceError("Помилка з'єднання");
    } finally {
      setPayAdvanceSubmitting(null);
    }
  }

  async function logout() {
    await fetch("/api/cabinet/logout", { method: "POST" });
    router.push("/cabinet/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400">Завантаження...</p>
      </div>
    );
  }

  if (!courier) return null;

  const statusInfo = STATUS_LABELS[courier.status || "inactive"] || STATUS_LABELS.inactive;
  const hasDebt = !!(courier.debt_amount && courier.debt_amount > 0);
  const isActive = courier.status === "active";
  const activeSub = subscription && subscription.status === "active" ? subscription : null;

  const priceFieldsBlock = (
    <>
      <div>
        <label className={lbl}>Вартість на тиждень *</label>
        <select value={priceOption} onChange={(e) => setPriceOption(e.target.value)} className={inp}>
          <option value="1750">1750 грн</option>
          <option value="2100">2100 грн</option>
          <option value="2400">2400 грн</option>
          <option value="2800">2800 грн</option>
          <option value="">інше</option>
        </select>
        {priceOption === "" && (
          <input
            type="number"
            min="1000"
            max="10000"
            value={customPrice}
            onChange={(e) => setCustomPrice(e.target.value)}
            className={`${inp} mt-2`}
            placeholder="Введіть суму"
          />
        )}
      </div>
      <div>
        <label className={lbl}>Модель скутера *</label>
        <select value={scooterModel} onChange={(e) => setScooterModel(e.target.value)} className={inp}>
          {SCOOTER_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div>
        <label className={lbl}>Оренда акумулятора (необов&apos;язково)</label>
        <div className="space-y-2">
          {BATTERY_OPTIONS.map((b) => (
            <label
              key={b.id}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-all ${batteries.includes(b.id) ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}
            >
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={batteries.includes(b.id)}
                  onChange={() => toggleBattery(b.id)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-slate-700 text-sm">{b.label}</span>
              </span>
              <span className="text-slate-500 text-sm shrink-0">+{b.weeklyPrice} грн/тиж</span>
            </label>
          ))}
        </div>
        {batteries.length > 0 && (
          <p className="text-xs text-slate-400 mt-2">
            Тариф зі скутером і акумулятором: {(parseInt(customPrice || priceOption || "0") || 0) + getBatteryWeeklyPrice(batteries)} грн/тиж
          </p>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-md mx-auto space-y-4">
        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900">{courier.full_name}</h1>
              <p className="text-slate-500 text-sm">{courier.phone}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>
          <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-600">
            Вийти з кабінету
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-3">
          <h2 className="font-bold text-slate-900">Договір</h2>
          {courier.contract_pdf_url ? (
            <a
              href={courier.contract_pdf_url}
              target="_blank"
              className="inline-block text-blue-600 font-medium hover:underline text-sm"
            >
              📄 Переглянути договір {courier.contract_signed_at ? `(підписано ${fmtDate(courier.contract_signed_at)})` : ""}
            </a>
          ) : (
            <p className="text-slate-400 text-sm">Договір ще не знайдено</p>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-3">
          <h2 className="font-bold text-slate-900">Оренда скутера</h2>
          <div className="text-sm text-slate-600 space-y-1">
            <p>Модель: <span className="font-medium text-slate-900">{courier.scooter_model || "—"}</span></p>
            <p>Місто: <span className="font-medium text-slate-900">{courier.city || "—"}</span></p>
            <p>Тариф: <span className="font-medium text-slate-900">{courier.weekly_price ? `${courier.weekly_price} грн/тиж` : "—"}</span></p>
            {courier.battery_types && courier.battery_types.length > 0 && (
              <p>Акумулятор: <span className="font-medium text-slate-900">
                {courier.battery_types.map((id) => BATTERY_OPTIONS.find((b) => b.id === id)?.label || id).join(", ")}
              </span></p>
            )}
            {isActive && activeSub && (
              <p>Оплачено до: <span className="font-medium text-slate-900">{fmtDate(activeSub.expires_at)}</span></p>
            )}
            {!isActive && courier.return_signed_at && (
              <p>Скутер здано: <span className="font-medium text-slate-900">{fmtDate(courier.return_signed_at)}</span></p>
            )}
            {courier.return_pdf_url && (
              <a href={courier.return_pdf_url} target="_blank" className="inline-block text-blue-600 hover:underline">
                📄 Акт повернення
              </a>
            )}
          </div>

          {isActive && cashAdvanceRequested && (
            <p className="bg-yellow-50 text-yellow-700 px-4 py-3 rounded-xl text-sm">
              ⏳ Адміністратора сповіщено. Щойно він підтвердить отримання готівки — оплата зарахується на ваш рахунок.
            </p>
          )}

          {isActive && !cashAdvanceRequested && !showPayAdvance && (
            <button
              onClick={() => setShowPayAdvance(true)}
              className="w-full mt-2 bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700"
            >
              Оплатити наперед ще на тиждень
            </button>
          )}

          {isActive && !cashAdvanceRequested && showPayAdvance && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-xs text-slate-400">
                Можете лишити тариф/модель/акумулятор як є, або змінити перед оплатою.
              </p>
              {priceFieldsBlock}
              {payAdvanceError && <p className="bg-red-50 text-red-700 px-4 py-2 rounded-xl text-sm">{payAdvanceError}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={payAdvanceOnline}
                  disabled={payAdvanceSubmitting !== null}
                  className="flex-1 bg-green-600 text-white rounded-xl py-3 font-semibold hover:bg-green-700 disabled:opacity-60"
                >
                  {payAdvanceSubmitting === "online" ? "Обробка..." : "💳 Онлайн"}
                </button>
                <button
                  type="button"
                  onClick={payAdvanceCash}
                  disabled={payAdvanceSubmitting !== null}
                  className="flex-1 border-2 border-slate-200 text-slate-700 rounded-xl py-3 font-semibold hover:bg-slate-50 disabled:opacity-60"
                >
                  {payAdvanceSubmitting === "cash" ? "Обробка..." : "💵 Готівкою"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => { setShowPayAdvance(false); setPayAdvanceError(null); }}
                className="w-full text-sm text-slate-400 hover:text-slate-600"
              >
                Скасувати
              </button>
            </div>
          )}

          {!isActive && hasDebt && (
            <p className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">
              У вас є заборгованість. Зверніться до адміністратора PowerDrive, щоб продовжити роботу.
            </p>
          )}

          {!isActive && !hasDebt && !showReactivate && (
            <button
              onClick={() => setShowReactivate(true)}
              className="w-full mt-2 bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700"
            >
              Взяти скутер знову
            </button>
          )}

          {!isActive && !hasDebt && showReactivate && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div>
                <label className={lbl}>Місто *</label>
                <select value={city} onChange={(e) => setCity(e.target.value)} className={inp}>
                  {CITIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              {priceFieldsBlock}
              {formError && <p className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">{formError}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowReactivate(false)}
                  className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-3 font-medium hover:bg-slate-50"
                >
                  Скасувати
                </button>
                <button
                  onClick={submitReactivate}
                  disabled={submitting}
                  className="flex-grow bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 disabled:opacity-60"
                >
                  {submitting ? "Обробка..." : "Перейти до оплати →"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
