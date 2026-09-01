import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWeeklyPrice, daysOverdue, calculatePenalty, totalWithPenalty } from "@/lib/pricing";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId: number | string, text: string) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
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
        courier:couriers(full_name, city, weekly_price, telegram_chat_id)
      `)
      .eq("status", "active")
      .lt("expires_at", now.toISOString());

    if (error) {
      console.error("Cron overdue-courier error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!overdueSubs || overdueSubs.length === 0) {
      return NextResponse.json({ ok: true, notified: 0, blocked: 0 });
    }

    let notified = 0;
    let blocked = 0;

    for (const sub of overdueSubs) {
      const courier = sub.courier as unknown as {
        full_name: string;
        city: string;
        weekly_price: number | null;
        telegram_chat_id: number | null;
      } | null;

      if (!courier || !courier.telegram_chat_id) continue;

      const late = daysOverdue(sub.expires_at);
      if (late < 1) continue;

      const baseAmount = getWeeklyPrice(courier);
      const penalty = calculatePenalty(late);
      const total = totalWithPenalty(baseAmount, late);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://powerdrive.in.ua";
      const payUrl = `${appUrl}/payment/${sub.courier_id}`;

      if (late === 3) {
        await sendMessage(
          courier.telegram_chat_id,
          `🚫 <b>Скутер заблоковано</b>\n\n` +
          `Ваша оренда прострочена вже 3 дні. Скутер PowerDrive тимчасово заблоковано до погашення заборгованості.\n\n` +
          `💰 Сума до сплати: <b>${total} грн</b> (${baseAmount} + ${penalty} пеня)\n\n` +
          `Будь ласка, оберіть один із варіантів:\n\n` +
          `1️⃣ Сплатіть заборгованість — скутер розблокується автоматично\n` +
          `<a href="${payUrl}">💳 Оплатити онлайн</a>\n\n` +
          `2️⃣ Поверніть скутер — зв'яжіться з адміністратором для здачі скутера\n` +
          `📞 (066) 383 38 78`
        );
        blocked++;
      } else {
        await sendMessage(
          courier.telegram_chat_id,
          `⚠️ <b>Прострочена оплата оренди</b>\n\n` +
          `Ваша підписка на електроскутер PowerDrive закінчилась <b>${new Date(sub.expires_at).toLocaleDateString("uk-UA")}</b>.\n\n` +
          `Минуло днів прострочення: <b>${late}</b>\n` +
          `Пеня: 50 грн × ${late} ${late === 1 ? "день" : "дні"} = ${penalty} грн\n\n` +
          `💰 Сума до сплати: <b>${total} грн</b> (${baseAmount} + ${penalty} пеня)\n\n` +
          `<a href="${payUrl}">💳 Оплатити онлайн</a>\n\n` +
          `Або зверніться до адміністратора для оплати готівкою.\n\n` +
          `Кожен наступний день прострочення додає +50 грн пені.`
        );
      }
      notified++;
    }

    console.log(`Cron overdue-courier: notified ${notified}, blocked ${blocked}`);
    return NextResponse.json({ ok: true, notified, blocked });
  } catch (error) {
    console.error("Cron overdue-courier error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}