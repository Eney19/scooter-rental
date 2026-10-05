import { supabaseAdmin } from "@/lib/supabase";
import { getWeeklyPrice, getDepositAmount, getBatteryWeeklyPrice } from "@/lib/pricing";
import { isFirstPayment } from "@/lib/subscription";
import { getAdminChatIds } from "@/lib/telegram";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Курʼєр (з бота) обрав оплату готівкою на місці — сповіщаємо адмінів
// кнопкою "Підтвердити готівкову оплату" (callback_data "cash_<courierId>"
// обробляється в /api/telegram/webhook). Раніше це був окремий роут
// /api/cash-payment-request, який викликався з особистого кабінету.
export async function requestCashPayment(courierId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: courier, error } = await supabaseAdmin
    .from("couriers")
    .select("full_name, phone, city, weekly_price, battery_types")
    .eq("id", courierId)
    .single();

  if (error || !courier) return { ok: false, error: "Кур'єра не знайдено" };

  const rentAmount = getWeeklyPrice(courier);
  // Лише для інформації адміну — скільки готівки очікувати, з завдатком за
  // скутер, якщо це перша оплата курʼєра (сам завдаток по містах — @lib/pricing).
  const firstPayment = await isFirstPayment(courierId);
  const deposit = firstPayment ? getDepositAmount(courier.city) : 0;
  const batteryAmount = getBatteryWeeklyPrice(courier.battery_types);
  const scooterAmount = rentAmount - batteryAmount;
  const amount = rentAmount + deposit;

  const adminChatIds = getAdminChatIds();
  if (!BOT_TOKEN || adminChatIds.length === 0) return { ok: false, error: "Бот не налаштований" };

  let delivered = 0;
  for (const chatId of adminChatIds) {
    const res = await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        parse_mode: "HTML",
        text:
          "💵 <b>Кур'єр обрав оплату готівкою на місці</b>\n\n" +
          `${courier.full_name}\n${courier.phone}\n${courier.city || ""}\n` +
          (batteryAmount > 0 || deposit > 0
            ? [
                `оренда скутера ${scooterAmount} грн`,
                ...(batteryAmount > 0 ? [`оренда акумулятора ${batteryAmount} грн`] : []),
                ...(deposit > 0 ? [`завдаток за скутер ${deposit} грн`] : []),
              ].join(" + ") + ` = <b>${amount} грн</b>\n\n`
            : `${amount} грн/тиж\n\n`) +
          "Підтвердіть кнопкою нижче, коли отримаєте готівку — підписка активується автоматично.",
        reply_markup: {
          inline_keyboard: [[{ text: "💵 Підтвердити готівкову оплату", callback_data: `cash_${courierId}` }]],
        },
      }),
    });
    if (res.ok) delivered++;
  }

  if (delivered === 0) return { ok: false, error: "Не вдалося сповістити адміністратора" };
  return { ok: true };
}
