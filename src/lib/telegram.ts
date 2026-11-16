const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Список chat_id адміністраторів, яким ідуть службові сповіщення.
// ADMIN_TELEGRAM_CHAT_ID підтримує кілька id через кому
// ("111,222"), щоб сповіщення отримувала більш ніж одна людина.
export function getAdminChatIds(): number[] {
  const raw = process.env.ADMIN_TELEGRAM_CHAT_ID || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

export async function sendAdminMessage(text: string) {
  await Promise.all(getAdminChatIds().map((id) => sendTelegramMessage(id, text)));
}

export async function sendTelegramMessage(chatId: number, text: string) {
  const res = await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  return res.json();
}

export async function sendTelegramPaymentReminder(
  chatId: number,
  courierName: string,
  amount: number,
  paymentUrl: string
) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text:
        `⏰ <b>Нагадування про оплату</b>\n\n` +
        `Привіт, <b>${courierName}</b>!\n\n` +
        `Завтра спливає термін оренди електроскутера.\n` +
        `Сума до сплати: <b>${amount} грн</b>\n\n` +
        `Оплатіть вчасно щоб продовжити користування скутером.`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: `💳 Оплатити ${amount} грн`, url: paymentUrl }]],
      },
    }),
  });
}

export async function sendTelegramPaymentSuccess(chatId: number, courierName: string, amount: number) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text:
        `✅ <b>Оплату підтверджено!</b>\n\n` +
        `${courierName}, дякуємо за оплату ${amount} грн.\n` +
        `Підписка продовжена на 7 днів. 🛵`,
      parse_mode: "HTML",
    }),
  });
}

export async function sendTelegramPaymentFailed(chatId: number, courierName: string, paymentUrl: string) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text:
        `❌ <b>Помилка оплати</b>\n\n` +
        `${courierName}, не вдалося списати кошти.\n` +
        `Будь ласка, оплатіть вручну:`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "💳 Оплатити", url: paymentUrl }]],
      },
    }),
  });
}

// Chat_id, кому йде запит на блокування/розблокування скутера по GPS
// (окремо від загального ADMIN_TELEGRAM_CHAT_ID — ця дія серйозніша і
// призначена конкретній людині, яка фізично відправляє SMS на трекер).
// Якщо не налаштовано — падаємо назад на загальний список адмінів.
function getGpsBlockChatIds(): number[] {
  const raw = process.env.GPS_BLOCK_ADMIN_CHAT_ID || "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  return ids.length > 0 ? ids : getAdminChatIds();
}

// Надсилає в Telegram запит на блокування/розблокування скутера —
// з іменем курʼєра, назвою скутера, датою запиту і готовим посиланням
// sms:, яке відкриває застосунок Повідомлення з уже вписаним номером
// SIM-картки трекера і потрібним кодом (лишається тільки натиснути
// "Надіслати"). Це напівавтоматичний варіант, доки немає окремого
// Android-шлюзу для повної автоматизації.
export async function sendGpsBlockRequest(params: {
  courierName: string | null;
  scooterName: string;
  simPhone: string;
  action: "block" | "unblock";
}) {
  const { courierName, scooterName, simPhone, action } = params;
  const code = action === "block" ? "9400000" : "9410000";
  const smsLink = `sms:${simPhone}?body=${code}`;
  const dateStr = new Date().toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });

  const title = action === "block" ? "🔒 Запит на блокування скутера" : "🔓 Запит на розблокування скутера";
  const text =
    `${title}\n\n` +
    `Кур'єр: <b>${courierName || "—"}</b>\n` +
    `Скутер: <b>${scooterName}</b>\n` +
    `Дата запиту: ${dateStr}\n\n` +
    `Натисни посилання нижче — відкриється SMS з уже вписаним кодом, лишається відправити:\n` +
    `<a href="${smsLink}">📩 Відкрити SMS (${code})</a>`;

  await Promise.all(getGpsBlockChatIds().map((id) => sendTelegramMessage(id, text)));
}

export async function registerWebhook(appUrl: string) {
  const webhookUrl = `${appUrl}/api/telegram/webhook`;
  const res = await fetch(`${API}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  return res.json();
}
