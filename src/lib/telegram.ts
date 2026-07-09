const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

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

export async function registerWebhook(appUrl: string) {
  const webhookUrl = `${appUrl}/api/telegram/webhook`;
  const res = await fetch(`${API}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  return res.json();
}
