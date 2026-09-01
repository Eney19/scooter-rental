import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWeeklyPrice, daysOverdue, calculatePenalty, totalWithPenalty } from "@/lib/pricing";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessageWithButton(
  chatId: number | string,
  text: string,
  buttonText: string,
  callbackData: string
) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: buttonText, callback_data: callbackData }]],
      },
    }),
  });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    const { data: overdueSubs, error } = await supabaseAdmin
      .from("subscriptions")
      .select(`
        id, expires_at, amount, courier_id,
        courier:couriers(full_name, phone, city, weekly_price, telegram_chat_id)
      `)
      .eq("status", "active")
      .lt("expires_at", now.toISOString());

    if (error) {
      console.error("Cron overdue-admin error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!overdueSubs || overdueSubs.length === 0) {
      return NextResponse.json({ ok: true, reported: 0 });
    }

    let reported = 0;

    for (const sub of overdueSubs) {
      const courier = sub.courier as unknown as {
        full_name: string;
        phone: string;
        city: string;
        weekly_price: number | null;
        telegram_chat_id: number | null;
      } | null;

      if (!courier) continue;

      const late = daysOverdue(sub.expires_at);
      if (late < 1) continue;

      const baseAmount = getWeeklyPrice(courier);
      const penalty = calculatePenalty(late);
      const total = totalWithPenalty(baseAmount, late);

      if (ADMIN_CHAT_ID) {
        const callbackData = `cash_${sub.courier_id}`;
        await sendMessageWithButton(
          ADMIN_CHAT_ID,
          `🔴 <b>Прострочена оплата (день ${late})</b>\n\n` +
          `Курʼєр: <b>${courier.full_name}</b>\n` +
          `Телефон: ${courier.phone}\n` +
          `Місто: ${courier.city || "—"}\n` +
          `Прострочено з: <b>${new Date(sub.expires_at).toLocaleDateString("uk-UA")}</b>\n` +
          `Сума з пенею: <b>${total} грн</b> (${baseAmount} + ${penalty})\n\n` +
          `${late === 3 ? "🚫 Курʼєру надіслано повідомлення про блокування\n" : ""}` +
          `${courier.telegram_chat_id ? "✅ Курʼєр підключив Telegram" : "⚠️ Курʼєр не підключив Telegram"}`,
          "💵 Позначити оплату готівкою",
          callbackData
        );
        reported++;
      }
    }

    console.log(`Cron overdue-admin: reported ${reported}`);
    return NextResponse.json({ ok: true, reported });
  } catch (error) {
    console.error("Cron overdue-admin error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
