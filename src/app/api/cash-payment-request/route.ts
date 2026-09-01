import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWeeklyPrice } from "@/lib/pricing";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function POST(req: NextRequest) {
  try {
    const { courierId } = await req.json();
    if (!courierId) {
      return NextResponse.json({ success: false, error: "Відсутній courierId" }, { status: 400 });
    }

    const { data: courier, error } = await supabaseAdmin
      .from("couriers")
      .select("full_name, phone, city, weekly_price")
      .eq("id", courierId)
      .single();

    if (error || !courier) {
      return NextResponse.json({ success: false, error: "Кур'єра не знайдено" }, { status: 404 });
    }

    const amount = getWeeklyPrice(courier);

    if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
      return NextResponse.json({ success: false, error: "Бот не налаштований" }, { status: 500 });
    }

    // Той самий callback_data формат "cash_<courierId>", що вже обробляється в telegram/webhook
    await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        parse_mode: "HTML",
        text:
          "💵 <b>Кур'єр обрав оплату готівкою на місці</b>\n\n" +
          `${courier.full_name}\n${courier.phone}\n${courier.city || ""} | ${amount} грн/тиж\n\n` +
          "Підтвердіть кнопкою нижче, коли отримаєте готівку — підписка активується автоматично.",
        reply_markup: {
          inline_keyboard: [[{ text: "💵 Підтвердити готівкову оплату", callback_data: `cash_${courierId}` }]],
        },
      }),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("cash-payment-request error", err);
    return NextResponse.json({ success: false, error: "Внутрішня помилка" }, { status: 500 });
  }
}
