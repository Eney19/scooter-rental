import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWeeklyPrice, getDepositAmount, getBatteryWeeklyPrice } from "@/lib/pricing";
import { isFirstPayment } from "@/lib/subscription";
import { getAdminChatIds } from "@/lib/telegram";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function POST(req: NextRequest) {
  try {
    const { courierId } = await req.json();
    if (!courierId) {
      return NextResponse.json({ success: false, error: "Відсутній courierId" }, { status: 400 });
    }

    const { data: courier, error } = await supabaseAdmin
      .from("couriers")
      .select("full_name, phone, city, weekly_price, battery_types")
      .eq("id", courierId)
      .single();

    if (error || !courier) {
      return NextResponse.json({ success: false, error: "Кур'єра не знайдено" }, { status: 404 });
    }

    const rentAmount = getWeeklyPrice(courier);
    // Лише для інформації адміну — скільки готівки очікувати, з завдатком за
    // скутер, якщо це перша оплата курʼєра (сам завдаток по містах — @lib/pricing).
    const firstPayment = await isFirstPayment(courierId);
    const deposit = firstPayment ? getDepositAmount(courier.city) : 0;
    const batteryAmount = getBatteryWeeklyPrice(courier.battery_types);
    const scooterAmount = rentAmount - batteryAmount;
    const amount = rentAmount + deposit;

    const adminChatIds = getAdminChatIds();
    if (!BOT_TOKEN || adminChatIds.length === 0) {
      return NextResponse.json({ success: false, error: "Бот не налаштований" }, { status: 500 });
    }

    // Той самий callback_data формат "cash_<courierId>", що вже обробляється в telegram/webhook
    for (const chatId of adminChatIds) {
      await fetch(`${API}/sendMessage`, {
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
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("cash-payment-request error", err);
    return NextResponse.json({ success: false, error: "Внутрішня помилка" }, { status: 500 });
  }
}
