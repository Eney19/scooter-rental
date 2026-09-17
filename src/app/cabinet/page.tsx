"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BATTERY_OPTIONS, getBatteryWeeklyPrice } from "@/lib/pricing";

const inp = "w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-slate-900";
const lbl = "block text-sm font-medium text-slate-700 mb-1";
const CITIES = ["Луцьк", "Рівне", "Львів"];
const SCOOTER_MODELS = ["FADA Flit II", "Aima u1s", "Dominator A-9", "Crosser CR 21 Tank"];
const PRICE_OPTIONS = ["1750", "2100", "2400", "2800"];
const TELEGRAM_BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "powerdrive_scooter_bot";

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
  telegram_chat_id: number | null;
};

type Subscription = {
  status: string;
  expires_at: string;
  amount: number;
  paid_at: string | null;
} | null;

type RentalPeriod = {
  id: string;
  city: string | null;
  scooter_model: string | null;
  battery_types: string[] | null;
  weekly_price: number | null;
  contract_signed_at: string | null;
  started_at: string;
  ended_at: string | null;
};

type PaymentRecord = {
  id: string;
  amount: number;
  deposit: number | null;
  battery_amount: number | null;
  type: string;
  status: string;
  wayforpay_id: string | null;
  created_at: string;
};

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

export default function CabinetPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [courier, setCourier] = useState<Courier | null>(null);
  const [subscription, setSubscription] = useState<Subscription>(null);
  const [rentalHistory, setRentalHistory] = useState<RentalPeriod[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);

  const [showReactivate, setShowReactivate] = useState(false);
  const [city, setCity] = useState("Луцьк");
  const [priceOption, setPriceOption] = useState("2400");
  const [customPrice, setCustomPrice] = useState("");
  const [scooterModel, setScooterModel] = useState(SCOOTER_MODELS[0]);
  const [batteries, setBatteries] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState<"online" | "cash" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [cashReactivateRequested, setCashReactivateRequested] = useState(false);

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
        fetch("/api/cabinet/rental-history")
          .then((r) => r.json())
          .then((hd) => { if (hd.success) setRentalHistory(hd.periods); })
          .catch(() => {});
        fetch("/api/cabinet/payments")
          .then((r) => r.json())
          .then((pd) => { if (pd.success) setPaymentHistory(pd.payments); })
          .catch(() => {});
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

  async function reactivateSavePlan(): Promise<boolean> {
    if (!courier) return false;
    const price = customPrice || priceOption;
    const res = await fetch("/api/cabinet/reactivate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city, weeklyPrice: price, scooterModel, batteryTypes: batteries }),
    });
    const data = await res.json();
    if (!data.success) {
      setFormError(data.error || "Помилка. Спробуйте ще раз");
      return false;
    }
    return true;
  }

  async function reactivateOnline() {
    if (!courier) return;
    setSubmitting("online");
    setFormError(null);
    try {
      const ok = await reactivateSavePlan();
      if (!ok) return;
      router.push(`/payment/${courier.id}`);
    } catch {
      setFormError("Помилка з'єднання");
    } finally {
      setSubmitting(null);
    }
  }

  async function reactivateCash() {
    if (!courier) return;
    setSubmitting("cash");
    setFormError(null);
    try {
      const ok = await reactivateSavePlan();
      if (!ok) return;
      const res = await fetch("/api/cash-payment-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierId: courier.id }),
      });
      const data = await res.json();
      if (!data.success) {
        setFormError(data.error || "Помилка. Спробуйте ще раз");
        return;
      }
      setCashReactivateRequested(true);
    } catch {
      setFormError("Помилка з'єднання");
    } finally {
      setSubmitting(null);
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

        {courier.telegram_chat_id ? (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-sm px-4 py-3">
            <span className="text-lg">✅</span>
            <p className="text-emerald-800 text-sm font-medium">Telegram-бот PowerDrive підключено</p>
          </div>
        ) : (
          <a
            href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}
            target="_blank"
            className="block bg-sky-50 border border-sky-200 rounded-2xl shadow-sm p-4 hover:bg-sky-100 transition-colors"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">✈️</span>
              <div>
                <p className="font-semibold text-sky-900 text-sm">Підключіть Telegram-бот PowerDrive</p>
                <p className="text-sky-700 text-xs mt-0.5">
                  Нагадування про оплату, статус підписки та швидка оплата — прямо в Telegram. Натисніть, щоб підключити.
                </p>
              </div>
            </div>
          </a>
        )}

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
            {isActive && activeSub && (() => {
              const weeksAhead = weeksAheadPaid(activeSub.expires_at);
              return (
                <p>
                  Оплачено до: <span className="font-medium text-slate-900">{fmtDate(activeSub.expires_at)}</span>
                  {weeksAhead >= 2 && (
                    <span className="ml-1 text-emerald-600 font-medium">
                      (+{weeksAhead - 1} {weeksWord(weeksAhead - 1)} наперед)
                    </span>
                  )}
                </p>
              );
            })()}
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

          {!isActive && !hasDebt && cashReactivateRequested && (
            <p className="bg-yellow-50 text-yellow-700 px-4 py-3 rounded-xl text-sm">
              ⏳ Адміністратора сповіщено. Щойно він підтвердить отримання готівки — оренда активується.
            </p>
          )}

          {!isActive && !hasDebt && !cashReactivateRequested && !showReactivate && (
            <button
              onClick={() => setShowReactivate(true)}
              className="w-full mt-2 bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700"
            >
              Взяти скутер знову
            </button>
          )}

          {!isActive && !hasDebt && !cashReactivateRequested && showReactivate && (
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
                  onClick={reactivateOnline}
                  disabled={submitting !== null}
                  className="flex-1 bg-green-600 text-white rounded-xl py-3 font-semibold hover:bg-green-700 disabled:opacity-60"
                >
                  {submitting === "online" ? "Обробка..." : "💳 Онлайн"}
                </button>
                <button
                  type="button"
                  onClick={reactivateCash}
                  disabled={submitting !== null}
                  className="flex-1 border-2 border-slate-200 text-slate-700 rounded-xl py-3 font-semibold hover:bg-slate-50 disabled:opacity-60"
                >
                  {submitting === "cash" ? "Обробка..." : "💵 Готівкою"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => { setShowReactivate(false); setFormError(null); }}
                className="w-full text-sm text-slate-400 hover:text-slate-600"
              >
                Скасувати
              </button>
            </div>
          )}
        </div>

        {rentalHistory.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-3">
            <h2 className="font-bold text-slate-900">Історія оренди</h2>
            <div className="space-y-3">
              {rentalHistory.map((p) => (
                <div key={p.id} className="border border-slate-100 rounded-xl p-4 text-sm text-slate-600 space-y-1">
                  <p className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">
                      {fmtDate(p.started_at)} — {p.ended_at ? fmtDate(p.ended_at) : "дотепер"}
                    </span>
                    {!p.ended_at && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        активний
                      </span>
                    )}
                  </p>
                  <p>Місто: <span className="font-medium text-slate-900">{p.city || "—"}</span></p>
                  <p>Модель: <span className="font-medium text-slate-900">{p.scooter_model || "—"}</span></p>
                  {p.battery_types && p.battery_types.length > 0 && (
                    <p>Акумулятор: <span className="font-medium text-slate-900">
                      {p.battery_types.map((id) => BATTERY_OPTIONS.find((b) => b.id === id)?.label || id).join(", ")}
                    </span></p>
                  )}
                  <p>Тариф: <span className="font-medium text-slate-900">{p.weekly_price ? `${p.weekly_price} грн/тиж` : "—"}</span></p>
                  <p>Договір підписано: <span className="font-medium text-slate-900">{fmtDate(p.contract_signed_at)}</span></p>
                </div>
              ))}
            </div>
          </div>
        )}

        {paymentHistory.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-3">
            <h2 className="font-bold text-slate-900">Історія платежів</h2>
            <div className="space-y-2">
              {paymentHistory.map((p) => {
                const deposit = p.deposit || 0;
                const batteryAmount = p.battery_amount || 0;
                const scooterAmount = p.amount - deposit - batteryAmount;
                const hasBreakdown = deposit > 0 || batteryAmount > 0;
                return (
                  <div key={p.id} className="flex items-center justify-between text-sm border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                    <div>
                      <p className="font-medium text-slate-900">{fmtDate(p.created_at)}</p>
                      <p className="text-slate-400 text-xs">
                        {p.wayforpay_id && p.wayforpay_id.startsWith("cash_") ? "💵 Готівка" : "💳 Онлайн"}
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
          </div>
        )}
      </div>
    </div>
  );
}
