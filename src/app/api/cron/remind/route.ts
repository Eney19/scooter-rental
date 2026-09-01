import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId: number | string, text: string) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

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
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: expiringSubs, error } = await supabaseAdmin
      .from("subscriptions")
      .select(`
        id, expires_at, amount, courier_id,
        courier:couriers(full_name, phone, city, telegram_chat_id)
      `)
      .eq("status", "active")
      .gte("expires_at", now.toISOString())
      .lte("expires_at", tomorrow.toISOString());

    if (error) {
      console.error("Cron remind error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!expiringSubs || expiringSubs.length === 0) {
      console.log("Cron remind: no expiring subscriptions");
      return NextResponse.json({ ok: true, reminded: 0 });
    }

    let reminded = 0;

    for (const sub of expiringSubs) {
      const courier = sub.courier as unknown as {
        full_name: string;
        phone: string;
        city: string;
        telegram_chat_id: number | null;
      } | null;

      if (!courier) continue;

      const expiresDate = new Date(sub.expires_at).toLocaleDateString("uk-UA");
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://powerdrive.in.ua";
      const payUrl = `${appUrl}/payment/${sub.courier_id}`;

      // Нагадування курʼєру
      if (courier.telegram_chat_id) {
        await sendMessage(
          courier.telegram_chat_id,
          `⏰ <b>Нагадування про оплату оренди</b>\n\n` +
          `Ваша підписка на електроскутер PowerDrive закінчується <b>${expiresDate}</b>.\n\n` +
          `Будь ласка, оплатіть наступний тиждень оренди, щоб продовжити користування скутером.\n\n` +
          `💰 Сума: <b>${sub.amount} грн / 7 днів</b>\n\n` +
          `<a href="${payUrl}">💳 Оплатити онлайн</a>\n\n` +
          `Або зверніться до адміністратора для оплати готівкою.`
        );
        reminded++;
      }

      // Сповіщення адміну з кнопкою "Позначити готівку"
      if (ADMIN_CHAT_ID) {
        // callback_data: cash_COURIER_ID
        const callbackData = `cash_${sub.courier_id}`;

        await sendMessageWithButton(
          ADMIN_CHAT_ID,
          `🔔 <b>Нагадування про оплату</b>\n\n` +
          `Курʼєр: <b>${courier.full_name}</b>\n` +
          `Телефон: ${courier.phone}\n` +
          `Місто: ${courier.city || "—"}\n` +
          `Підписка до: <b>${expiresDate}</b>\n` +
          `Сума: <b>${sub.amount} грн</b>\n\n` +
          `${courier.telegram_chat_id ? "✅ Нагадування надіслано курʼєру" : "⚠️ Курʼєр не підключив Telegram"}`,
          "💵 Позначити оплату готівкою",
          callbackData
        );
      }
    }

    console.log(`Cron remind: sent ${reminded} reminders`);
    return NextResponse.json({ ok: true, reminded, total: expiringSubs.length });
  } catch (error) {
    console.error("Cron remind error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
