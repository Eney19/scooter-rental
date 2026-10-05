import { supabaseAdmin } from "@/lib/supabase";
import {
  BATTERY_OPTIONS,
  getBatteryWeeklyPrice,
  getBatteryLabels,
  getDepositAmount,
  getWeeklyPrice,
  daysOverdue,
  totalWithPenalty,
} from "@/lib/pricing";
import { isFirstPayment } from "@/lib/subscription";
import { requestCashPayment } from "@/lib/cash-request";

// Особистий кабінет курʼєра в Telegram-боті (замінив сторінку /cabinet на сайті).
// Усі дії курʼєра — меню, оплата (онлайн / готівкою / наперед), історія оплат,
// документи, історія оренди, зміна тарифу, повторне взяття скутера — живуть тут.
// Callback-кнопки курʼєра мають префікс "c:" (адмінські — "cash_..."), тому не
// перетинаються з адмінськими.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://powerdrive.in.ua";

const CITIES = ["Луцьк", "Рівне", "Львів"];
const SCOOTER_MODELS = ["FADA Flit II", "Aima u1s", "Dominator A-9", "Crosser CR 21 Tank"];
const PRICE_OPTIONS = [1750, 2100, 2400, 2800];
const MIN_PRICE = 1000;
const MAX_PRICE = 10000;
const PAYMENTS_PAGE_SIZE = 5;
const RENTALS_PAGE_SIZE = 3;

const BTN_PAY = "💳 Оплатити";
const BTN_ADVANCE = "⏩ Оплатити наперед";
const BTN_STATUS = "📋 Статус";
const BTN_PAYMENTS = "🧾 Історія оплат";
const BTN_DOCS = "📄 Документи";
const BTN_RENTALS = "🛵 Історія оренди";

type InlineButton = { text: string; callback_data?: string; url?: string };
type Keyboard = InlineButton[][];

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
};

type Draft = { city: string; base: number; model: string; batteries: string[] };
type BotState = { mode: "adv" | "react" | null; awaiting: "price" | null; draft: Draft | null };

type CallbackQuery = {
  id: string;
  from: { id: number };
  data?: string;
  message?: { message_id: number; chat: { id: number } };
};

const COURIER_COLUMNS =
  "id, full_name, phone, city, status, weekly_price, scooter_model, battery_types, " +
  "contract_pdf_url, contract_signed_at, return_pdf_url, return_signed_at, debt_since, debt_amount";

// ───────────────────────── Telegram helpers ─────────────────────────

async function tg(method: string, body: object) {
  try {
    const res = await fetch(`${API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      // "message is not modified" — безпечна ситуація (повторне натискання)
      if (!txt.includes("message is not modified")) console.error(`courier-bot ${method} failed:`, txt);
    }
  } catch (err) {
    console.error(`courier-bot ${method} error:`, err);
  }
}

async function send(chatId: number, text: string, keyboard?: Keyboard, extra: object = {}) {
  await tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    ...extra,
  });
}

// Редагує повідомлення, якщо callback прийшов з нього, інакше шле нове.
async function show(chatId: number, messageId: number | null, text: string, keyboard?: Keyboard) {
  if (messageId) {
    await tg("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: keyboard || [] },
    });
  } else {
    await send(chatId, text, keyboard);
  }
}

async function answer(queryId: string, text?: string) {
  await tg("answerCallbackQuery", { callback_query_id: queryId, ...(text ? { text } : {}) });
}

export const COURIER_MENU_KEYBOARD = {
  keyboard: [
    [{ text: BTN_PAY }, { text: BTN_ADVANCE }],
    [{ text: BTN_STATUS }, { text: BTN_PAYMENTS }],
    [{ text: BTN_DOCS }, { text: BTN_RENTALS }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

// Надсилає текст разом із постійною клавіатурою-меню.
export async function sendCourierMenu(chatId: number, text: string) {
  await send(chatId, text, undefined, { reply_markup: COURIER_MENU_KEYBOARD });
}

// ───────────────────────── Formatting ─────────────────────────

function esc(s: string | null | undefined): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" });
}

function weeksWord(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "тиждень";
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "тижні";
  return "тижнів";
}

function weeksAheadPaid(expiresAt: string): number {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 7));
}

const STATUS_LABELS: Record<string, string> = {
  active: "✅ Активний",
  pending: "⏳ Очікує першої оплати",
  inactive: "💤 Неактивний (скутер здано)",
  debtor: "⚠️ Боржник",
};

function batteriesText(ids: string[] | null | undefined): string {
  const labels = getBatteryLabels(ids);
  return labels.length > 0 ? labels.join(", ") : "без акумулятора";
}

// ───────────────────────── Data access ─────────────────────────

async function getCourierByChat(chatId: number): Promise<Courier | null> {
  const { data, error } = await supabaseAdmin
    .from("couriers")
    .select(COURIER_COLUMNS)
    .eq("telegram_chat_id", chatId)
    .limit(1)
    .maybeSingle();
  if (error) console.error("courier-bot getCourierByChat error:", error);
  return (data as unknown as Courier) || null;
}

async function getCourierById(id: string): Promise<Courier | null> {
  const { data } = await supabaseAdmin.from("couriers").select(COURIER_COLUMNS).eq("id", id).maybeSingle();
  return (data as unknown as Courier) || null;
}

async function getState(courierId: string): Promise<BotState> {
  const { data } = await supabaseAdmin
    .from("courier_bot_state")
    .select("mode, awaiting, draft")
    .eq("courier_id", courierId)
    .maybeSingle();
  return {
    mode: (data?.mode as BotState["mode"]) || null,
    awaiting: (data?.awaiting as BotState["awaiting"]) || null,
    draft: (data?.draft as Draft) && Object.keys(data!.draft as object).length > 0 ? (data!.draft as Draft) : null,
  };
}

async function saveState(courierId: string, state: BotState) {
  const { error } = await supabaseAdmin.from("courier_bot_state").upsert({
    courier_id: courierId,
    mode: state.mode,
    awaiting: state.awaiting,
    draft: state.draft || {},
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("courier-bot saveState error:", error);
}

async function clearState(courierId: string) {
  await supabaseAdmin.from("courier_bot_state").delete().eq("courier_id", courierId);
}

// ───────────────────────── Payment quote ─────────────────────────

// Та сама логіка суми, що й у /api/monopay/create — щоб кнопка в боті завжди
// показувала те саме, що буде на сторінці оплати.
async function getQuote(courier: Courier) {
  const baseWeekly = getWeeklyPrice(courier);
  const batteryAmount = getBatteryWeeklyPrice(courier.battery_types);

  const { data: lastActive } = await supabaseAdmin
    .from("subscriptions")
    .select("expires_at")
    .eq("courier_id", courier.id)
    .eq("status", "active")
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const late = lastActive ? daysOverdue(lastActive.expires_at) : 0;
  const rentAmount =
    courier.status === "debtor" && typeof courier.debt_amount === "number"
      ? courier.debt_amount
      : totalWithPenalty(baseWeekly, late);
  const penalty = Math.max(0, rentAmount - baseWeekly);

  const first = await isFirstPayment(courier.id);
  const deposit = first ? getDepositAmount(courier.city) : 0;

  return {
    scooterAmount: baseWeekly - batteryAmount,
    batteryAmount,
    penalty,
    deposit,
    total: rentAmount + deposit,
  };
}

// ───────────────────────── Screens ─────────────────────────

function tariffLine(c: Courier): string {
  return (
    `🛵 ${esc(c.scooter_model) || "модель не вказана"} · 📍 ${esc(c.city) || "—"}\n` +
    `💵 Тариф: <b>${getWeeklyPrice(c)} грн/тиж</b> · 🔋 ${batteriesText(c.battery_types)}`
  );
}

async function sendStatus(chatId: number, courier: Courier) {
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("status, expires_at")
    .eq("courier_id", courier.id)
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const status = courier.status || "pending";
  let text = `📋 <b>${esc(courier.full_name)}</b>\n\nСтатус: <b>${STATUS_LABELS[status] || status}</b>\n`;

  if (sub) {
    if (status === "active") {
      const ahead = weeksAheadPaid(sub.expires_at);
      text += `📅 Підписка діє до: <b>${fmtDate(sub.expires_at)}</b>`;
      if (ahead >= 2) text += ` (+${ahead - 1} ${weeksWord(ahead - 1)} наперед)`;
      text += "\n";
    } else if (status === "debtor") {
      text += `📅 Підписка закінчилась: ${fmtDate(sub.expires_at)}\n`;
    }
  }
  if (status === "debtor" && courier.debt_amount) {
    text += `💸 Заборгованість: <b>${courier.debt_amount} грн</b>\n`;
  }
  text += `\n${tariffLine(courier)}`;

  const rows: Keyboard = [];
  if (status === "active") rows.push([{ text: "💳 Оплатити наперед", callback_data: "c:pay" }]);
  else if (status === "inactive") rows.push([{ text: "🛵 Взяти скутер знову", callback_data: "c:pay" }]);
  else rows.push([{ text: "💳 Оплатити", callback_data: "c:pay" }]);
  rows.push([
    { text: "🧾 Історія оплат", callback_data: "c:ph:0" },
    { text: "🛵 Історія оренди", callback_data: "c:rh:0" },
  ]);
  rows.push([{ text: "📄 Документи", callback_data: "c:docs" }]);

  await send(chatId, text, rows);
}

async function sendPayScreen(chatId: number, messageId: number | null, courier: Courier) {
  const q = await getQuote(courier);
  const parts = [`оренда скутера ${q.scooterAmount} грн`];
  if (q.batteryAmount > 0) parts.push(`акумулятор ${q.batteryAmount} грн`);
  if (q.penalty > 0) parts.push(`пеня ${q.penalty} грн`);
  if (q.deposit > 0) parts.push(`завдаток ${q.deposit} грн`);

  const isActive = courier.status === "active";
  const text =
    `💳 <b>${isActive ? "Оплата наперед" : "Оплата оренди"}</b>\n\n` +
    `${tariffLine(courier)}\n\n` +
    `${parts.join(" + ")}\n` +
    `Разом: <b>${q.total} грн</b>` +
    (isActive ? " за ще 7 днів" : " за 7 днів") +
    (q.deposit > 0 ? "\n\nЗавдаток стягується одноразово й повертається при поверненні скутера." : "") +
    `\n\nОберіть спосіб оплати:`;

  const rows: Keyboard = [
    [{ text: `💳 Онлайн — ${q.total} грн`, url: `${APP_URL}/payment/${courier.id}` }],
    [{ text: "💵 Готівкою (повідомити адміністратора)", callback_data: "c:cash" }],
  ];
  if (isActive) rows.push([{ text: "✏️ Змінити тариф / модель / акумулятор", callback_data: "c:edit" }]);
  await show(chatId, messageId, text, rows);
}

// Вхід у процес оплати з кнопки/команди.
async function startPay(chatId: number, messageId: number | null, courier: Courier) {
  const status = courier.status || "pending";

  if (status === "inactive") {
    if (courier.debt_amount && courier.debt_amount > 0) {
      await show(chatId, messageId, "У вас є заборгованість. Зверніться до адміністратора PowerDrive, щоб продовжити.");
      return;
    }
    await openEditor(chatId, messageId, courier, "react");
    return;
  }

  if (status === "pending" && !courier.contract_signed_at) {
    await show(
      chatId,
      messageId,
      "Спочатку завершіть реєстрацію та підпишіть договір на сайті PowerDrive — після цього оплата стане доступною тут."
    );
    return;
  }

  await sendPayScreen(chatId, messageId, courier);
}

async function sendDocs(chatId: number, courier: Courier) {
  const rows: Keyboard = [];
  let text = "📄 <b>Документи</b>\n\n";
  if (courier.contract_pdf_url) {
    text += `Договір оренди — підписано ${fmtDate(courier.contract_signed_at)}\n`;
    rows.push([{ text: "📄 Відкрити договір", url: courier.contract_pdf_url }]);
  } else {
    text += "Договір ще не підписано.\n";
  }
  if (courier.return_pdf_url) {
    text += `Акт повернення — підписано ${fmtDate(courier.return_signed_at)}\n`;
    rows.push([{ text: "📄 Відкрити акт повернення", url: courier.return_pdf_url }]);
  }
  await send(chatId, text, rows.length ? rows : undefined);
}

async function showPaymentHistory(chatId: number, messageId: number | null, courier: Courier, page: number) {
  const { count } = await supabaseAdmin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("courier_id", courier.id)
    .eq("status", "success");

  const total = count || 0;
  if (total === 0) {
    await show(chatId, messageId, "🧾 <b>Історія оплат</b>\n\nОплат ще немає.", [
      [{ text: "💳 Оплатити", callback_data: "c:pay" }],
    ]);
    return;
  }

  const pages = Math.ceil(total / PAYMENTS_PAGE_SIZE);
  const p = Math.min(Math.max(0, page), pages - 1);
  const { data: payments } = await supabaseAdmin
    .from("payments")
    .select("id, amount, deposit, battery_amount, wayforpay_id, created_at")
    .eq("courier_id", courier.id)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .range(p * PAYMENTS_PAGE_SIZE, p * PAYMENTS_PAGE_SIZE + PAYMENTS_PAGE_SIZE - 1);

  let text = `🧾 <b>Історія оплат</b> (${p + 1}/${pages})\n`;
  for (const pay of payments || []) {
    const deposit = pay.deposit || 0;
    const battery = pay.battery_amount || 0;
    const scooter = pay.amount - deposit - battery;
    const isCash = !!pay.wayforpay_id && pay.wayforpay_id.startsWith("cash_");
    text += `\n<b>${fmtDate(pay.created_at)}</b> · ${isCash ? "💵 Готівка" : "💳 Онлайн"} · <b>${pay.amount} грн</b>`;
    if (deposit > 0 || battery > 0) {
      text +=
        `\n<i>оренда скутера ${scooter} грн` +
        (battery > 0 ? ` + акумулятор ${battery} грн` : "") +
        (deposit > 0 ? ` + завдаток ${deposit} грн` : "") +
        `</i>`;
    }
    text += "\n";
  }

  const nav: InlineButton[] = [];
  if (p > 0) nav.push({ text: "⬅️ Новіші", callback_data: `c:ph:${p - 1}` });
  if (p < pages - 1) nav.push({ text: "Старіші ➡️", callback_data: `c:ph:${p + 1}` });
  const rows: Keyboard = [];
  if (nav.length) rows.push(nav);
  rows.push([{ text: "💳 Оплатити", callback_data: "c:pay" }]);
  await show(chatId, messageId, text, rows);
}

async function showRentalHistory(chatId: number, messageId: number | null, courier: Courier, page: number) {
  const { count } = await supabaseAdmin
    .from("rental_periods")
    .select("id", { count: "exact", head: true })
    .eq("courier_id", courier.id);

  const total = count || 0;
  if (total === 0) {
    await show(chatId, messageId, "🛵 <b>Історія оренди</b>\n\nПеріодів оренди ще немає.");
    return;
  }

  const pages = Math.ceil(total / RENTALS_PAGE_SIZE);
  const p = Math.min(Math.max(0, page), pages - 1);
  const { data: periods } = await supabaseAdmin
    .from("rental_periods")
    .select("id, city, scooter_model, battery_types, weekly_price, contract_signed_at, started_at, ended_at")
    .eq("courier_id", courier.id)
    .order("started_at", { ascending: false })
    .range(p * RENTALS_PAGE_SIZE, p * RENTALS_PAGE_SIZE + RENTALS_PAGE_SIZE - 1);

  let text = `🛵 <b>Історія оренди</b> (${p + 1}/${pages})\n`;
  for (const r of periods || []) {
    text += `\n<b>${fmtDate(r.started_at)} — ${r.ended_at ? fmtDate(r.ended_at) : "дотепер"}</b>${r.ended_at ? "" : " 🟢"}\n`;
    text += `Місто: ${esc(r.city) || "—"}\n`;
    text += `Модель: ${esc(r.scooter_model) || "—"}\n`;
    if (r.battery_types && r.battery_types.length > 0) {
      text += `Акумулятор: ${r.battery_types
        .map((id: string) => BATTERY_OPTIONS.find((b) => b.id === id)?.label || id)
        .join(", ")}\n`;
    }
    text += `Тариф: ${r.weekly_price ? `${r.weekly_price} грн/тиж` : "—"}\n`;
    text += `Договір підписано: ${fmtDate(r.contract_signed_at)}\n`;
  }

  const nav: InlineButton[] = [];
  if (p > 0) nav.push({ text: "⬅️ Новіші", callback_data: `c:rh:${p - 1}` });
  if (p < pages - 1) nav.push({ text: "Старіші ➡️", callback_data: `c:rh:${p + 1}` });
  await show(chatId, messageId, text, nav.length ? [nav] : undefined);
}

// ───────────────────────── Plan editor ─────────────────────────

function draftTotal(d: Draft): number {
  return d.base + getBatteryWeeklyPrice(d.batteries);
}

function initialDraft(c: Courier): Draft {
  const batteries = Array.isArray(c.battery_types) ? c.battery_types : [];
  const batteryPrice = getBatteryWeeklyPrice(batteries);
  const storedTotal = c.weekly_price && c.weekly_price > 0 ? c.weekly_price : 0;
  const base = storedTotal - batteryPrice >= MIN_PRICE ? storedTotal - batteryPrice : 2400;
  return {
    city: c.city && CITIES.includes(c.city) ? c.city : CITIES[0],
    base,
    model: c.scooter_model && SCOOTER_MODELS.includes(c.scooter_model) ? c.scooter_model : SCOOTER_MODELS[0],
    batteries,
  };
}

function editorView(mode: "adv" | "react", d: Draft): { text: string; rows: Keyboard } {
  const title = mode === "react" ? "🛵 Взяти скутер знову" : "✏️ Тариф і скутер";
  const text =
    `<b>${title}</b>\n\n` +
    (mode === "react" ? `📍 Місто: <b>${esc(d.city)}</b>\n` : "") +
    `💵 Оренда скутера: <b>${d.base} грн/тиж</b>\n` +
    `🛵 Модель: <b>${esc(d.model)}</b>\n` +
    `🔋 Акумулятор: <b>${batteriesText(d.batteries)}</b>\n\n` +
    `Разом: <b>${draftTotal(d)} грн/тиж</b>\n\n` +
    `Змініть потрібне або натисніть «Далі до оплати».`;
  const rows: Keyboard = [];
  if (mode === "react") rows.push([{ text: "📍 Місто", callback_data: "c:ed:city" }]);
  rows.push([
    { text: "💵 Ціна", callback_data: "c:ed:price" },
    { text: "🛵 Модель", callback_data: "c:ed:model" },
    { text: "🔋 Акумулятор", callback_data: "c:ed:bat" },
  ]);
  rows.push([{ text: "✅ Далі до оплати", callback_data: "c:go" }]);
  rows.push([{ text: "✖️ Скасувати", callback_data: "c:cancel" }]);
  return { text, rows };
}

async function openEditor(chatId: number, messageId: number | null, courier: Courier, mode: "adv" | "react") {
  const draft = initialDraft(courier);
  await saveState(courier.id, { mode, awaiting: null, draft });
  const v = editorView(mode, draft);
  await show(chatId, messageId, v.text, v.rows);
}

async function showEditor(chatId: number, messageId: number | null, state: BotState) {
  if (!state.mode || !state.draft) return;
  const v = editorView(state.mode, state.draft);
  await show(chatId, messageId, v.text, v.rows);
}

async function showEditorSubmenu(chatId: number, messageId: number, state: BotState, kind: string) {
  const d = state.draft!;
  if (kind === "city") {
    await show(chatId, messageId, "📍 Оберіть місто:", [
      ...CITIES.map((c, i) => [{ text: (c === d.city ? "✅ " : "") + c, callback_data: `c:sv:city:${i}` }]),
      [{ text: "⬅️ Назад", callback_data: "c:back" }],
    ]);
  } else if (kind === "price") {
    const rows: Keyboard = [
      PRICE_OPTIONS.map((p, i) => ({ text: (p === d.base ? "✅ " : "") + `${p}`, callback_data: `c:sv:price:${i}` })),
      [{ text: "✍️ Інша сума", callback_data: "c:sv:price:x" }],
      [{ text: "⬅️ Назад", callback_data: "c:back" }],
    ];
    await show(chatId, messageId, "💵 Оберіть тижневу ціну оренди скутера (грн, без акумулятора):", rows);
  } else if (kind === "model") {
    await show(chatId, messageId, "🛵 Оберіть модель скутера:", [
      ...SCOOTER_MODELS.map((m, i) => [{ text: (m === d.model ? "✅ " : "") + m, callback_data: `c:sv:model:${i}` }]),
      [{ text: "⬅️ Назад", callback_data: "c:back" }],
    ]);
  } else if (kind === "bat") {
    await show(chatId, messageId, "🔋 Акумулятор (можна обрати кілька, натисніть ще раз, щоб зняти):", [
      ...BATTERY_OPTIONS.map((b, i) => [
        {
          text: `${d.batteries.includes(b.id) ? "✅" : "▫️"} ${b.label} (+${b.weeklyPrice} грн/тиж)`,
          callback_data: `c:tg:${i}`,
        },
      ]),
      [{ text: "⬅️ Готово", callback_data: "c:back" }],
    ]);
  }
}

// Зберігає обраний тариф на картці курʼєра (як раніше робили
// /api/cabinet/update-plan та /api/cabinet/reactivate) і веде до оплати.
async function commitPlan(chatId: number, messageId: number, courier: Courier, state: BotState) {
  const d = state.draft;
  if (!state.mode || !d) {
    await show(chatId, messageId, "Сесія редагування застаріла. Натисніть «💳 Оплатити» ще раз.");
    return;
  }
  const total = draftTotal(d);
  if (d.base < MIN_PRICE || d.base > MAX_PRICE) {
    await show(chatId, messageId, "Некоректна ціна. Натисніть «💳 Оплатити» і спробуйте ще раз.");
    return;
  }

  if (state.mode === "adv" && courier.status !== "active") {
    await show(chatId, messageId, "Ця дія доступна лише для активної підписки.");
    await clearState(courier.id);
    return;
  }
  if (state.mode === "react") {
    if (courier.status !== "inactive") {
      await show(chatId, messageId, "Скутер вже активний.");
      await clearState(courier.id);
      return;
    }
    if (courier.debt_amount && courier.debt_amount > 0) {
      await show(chatId, messageId, "У вас є заборгованість. Зверніться до адміністратора, щоб продовжити.");
      await clearState(courier.id);
      return;
    }
  }

  const { error } = await supabaseAdmin
    .from("couriers")
    .update({
      weekly_price: total,
      scooter_model: d.model,
      battery_types: d.batteries,
      ...(state.mode === "react" ? { city: d.city } : {}),
    })
    .eq("id", courier.id);

  if (error) {
    console.error("courier-bot commitPlan error:", error);
    await show(chatId, messageId, "Помилка з'єднання з базою. Спробуйте ще раз.", [
      [{ text: "🔁 Спробувати ще раз", callback_data: "c:go" }],
    ]);
    return;
  }

  await clearState(courier.id);
  const fresh = await getCourierById(courier.id);
  if (fresh) await sendPayScreen(chatId, messageId, fresh);
}

async function requestCash(chatId: number, messageId: number | null, courier: Courier) {
  const res = await requestCashPayment(courier.id);
  if (!res.ok) {
    await show(chatId, messageId, `❌ ${res.error || "Не вдалося надіслати запит. Спробуйте ще раз."}`, [
      [{ text: "🔁 Спробувати ще раз", callback_data: "c:cash" }],
    ]);
    return;
  }
  await show(
    chatId,
    messageId,
    "⏳ Адміністратора сповіщено. Щойно він підтвердить отримання готівки — оплата буде зарахована, і ви отримаєте повідомлення тут."
  );
}

// ───────────────────────── Entry points ─────────────────────────

// Текстові повідомлення (команди та кнопки меню). Повертає false, якщо чат не
// привʼязаний до жодного курʼєра — тоді webhook продовжує зі своїм fallback.
export async function handleCourierText(chatId: number, rawText: string): Promise<boolean> {
  const courier = await getCourierByChat(chatId);
  if (!courier) return false;

  const text = rawText.trim();

  // Очікуємо власну суму оренди (редактор тарифу)
  const state = await getState(courier.id);
  if (state.awaiting === "price" && state.draft && state.mode) {
    const n = Number(text.replace(/\s/g, ""));
    if (text && /^\d+$/.test(text.replace(/\s/g, "")) && n >= MIN_PRICE && n <= MAX_PRICE) {
      state.draft.base = n;
      state.awaiting = null;
      await saveState(courier.id, state);
      await showEditor(chatId, null, state);
      return true;
    }
    if (!text.startsWith("/") && ![BTN_PAY, BTN_ADVANCE, BTN_STATUS, BTN_PAYMENTS, BTN_DOCS, BTN_RENTALS].includes(text)) {
      await send(chatId, `Введіть суму числом від ${MIN_PRICE} до ${MAX_PRICE} грн (наприклад, 2500).`);
      return true;
    }
    // Інша команда — виходимо з режиму введення
    state.awaiting = null;
    await saveState(courier.id, state);
  }

  const cmd = text.split(/[\s@]/)[0].toLowerCase();

  if (cmd === "/status" || text === BTN_STATUS) {
    await sendStatus(chatId, courier);
  } else if (cmd === "/pay" || text === BTN_PAY) {
    await startPay(chatId, null, courier);
  } else if (cmd === "/advance" || text === BTN_ADVANCE) {
    if (courier.status === "active") {
      await sendPayScreen(chatId, null, courier);
    } else {
      await send(
        chatId,
        "Оплата наперед доступна для активної підписки. Скористайтесь кнопкою «💳 Оплатити».",
        [[{ text: "💳 Оплатити", callback_data: "c:pay" }]]
      );
    }
  } else if (cmd === "/history" || text === BTN_PAYMENTS) {
    await showPaymentHistory(chatId, null, courier, 0);
  } else if (cmd === "/docs" || text === BTN_DOCS) {
    await sendDocs(chatId, courier);
  } else if (cmd === "/rentals" || text === BTN_RENTALS) {
    await showRentalHistory(chatId, null, courier, 0);
  } else {
    await sendCourierMenu(
      chatId,
      "Оберіть дію в меню нижче:\n\n" +
        `${BTN_PAY} — оплатити оренду\n` +
        `${BTN_ADVANCE} — оплатити ще на тиждень уперед\n` +
        `${BTN_STATUS} — статус підписки\n` +
        `${BTN_PAYMENTS} — усі ваші оплати\n` +
        `${BTN_DOCS} — договір та акт повернення\n` +
        `${BTN_RENTALS} — періоди оренди`
    );
  }
  return true;
}

// Натискання inline-кнопок курʼєра ("c:..."). Повертає true, якщо callback
// оброблено тут (тоді webhook не передає його в адмінську гілку).
export async function handleCourierCallback(query: CallbackQuery): Promise<boolean> {
  const data = query.data || "";
  if (!data.startsWith("c:")) return false;

  const chatId = query.message?.chat.id ?? query.from.id;
  const messageId = query.message?.message_id ?? null;

  const courier = await getCourierByChat(query.from.id);
  if (!courier) {
    await answer(query.id, "Спочатку підключіться командою /start");
    return true;
  }

  const [, action, arg1, arg2] = data.split(":");

  if (action === "pay") {
    await answer(query.id);
    await startPay(chatId, messageId, courier);
    return true;
  }
  if (action === "cash") {
    await answer(query.id);
    await requestCash(chatId, messageId, courier);
    return true;
  }
  if (action === "docs") {
    await answer(query.id);
    await sendDocs(chatId, courier);
    return true;
  }
  if (action === "ph") {
    await answer(query.id);
    await showPaymentHistory(chatId, messageId, courier, parseInt(arg1, 10) || 0);
    return true;
  }
  if (action === "rh") {
    await answer(query.id);
    await showRentalHistory(chatId, messageId, courier, parseInt(arg1, 10) || 0);
    return true;
  }
  if (action === "edit") {
    await answer(query.id);
    if (courier.status !== "active") {
      await show(chatId, messageId, "Ця дія доступна лише для активної підписки.");
      return true;
    }
    await openEditor(chatId, messageId, courier, "adv");
    return true;
  }
  if (action === "cancel") {
    await answer(query.id);
    await clearState(courier.id);
    await show(chatId, messageId, "Скасовано.");
    return true;
  }

  // Далі — дії редактора, їм потрібен збережений стан
  const state = await getState(courier.id);
  if (!state.mode || !state.draft || messageId === null) {
    await answer(query.id, "Сесія застаріла — натисніть «💳 Оплатити» ще раз");
    return true;
  }
  const d = state.draft;

  if (action === "ed" && arg1) {
    await answer(query.id);
    await showEditorSubmenu(chatId, messageId, state, arg1);
    return true;
  }
  if (action === "back") {
    await answer(query.id);
    state.awaiting = null;
    await saveState(courier.id, state);
    await showEditor(chatId, messageId, state);
    return true;
  }
  if (action === "sv" && arg1) {
    const idx = parseInt(arg2, 10);
    if (arg1 === "city" && CITIES[idx]) d.city = CITIES[idx];
    else if (arg1 === "model" && SCOOTER_MODELS[idx]) d.model = SCOOTER_MODELS[idx];
    else if (arg1 === "price" && arg2 === "x") {
      state.awaiting = "price";
      await saveState(courier.id, state);
      await answer(query.id);
      await show(chatId, messageId, `✍️ Надішліть тижневу ціну оренди скутера числом (від ${MIN_PRICE} до ${MAX_PRICE} грн).`, [
        [{ text: "⬅️ Назад", callback_data: "c:back" }],
      ]);
      return true;
    } else if (arg1 === "price" && PRICE_OPTIONS[idx]) d.base = PRICE_OPTIONS[idx];
    await answer(query.id);
    state.draft = d;
    await saveState(courier.id, state);
    await showEditor(chatId, messageId, state);
    return true;
  }
  if (action === "tg") {
    const opt = BATTERY_OPTIONS[parseInt(arg1, 10)];
    if (opt) {
      d.batteries = d.batteries.includes(opt.id) ? d.batteries.filter((b) => b !== opt.id) : [...d.batteries, opt.id];
      state.draft = d;
      await saveState(courier.id, state);
    }
    await answer(query.id);
    await showEditorSubmenu(chatId, messageId, state, "bat");
    return true;
  }
  if (action === "go") {
    await answer(query.id);
    await commitPlan(chatId, messageId, courier, state);
    return true;
  }

  await answer(query.id);
  return true;
}
