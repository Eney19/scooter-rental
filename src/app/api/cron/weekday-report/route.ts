import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWeeklyPrice } from "@/lib/pricing";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const WEEKDAY_NAMES = ["неділя", "понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота"];

async function sendMessage(chatId: string, text: string) {
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
    const today = new Date();
    const todayWeekday = today.getDay(); // 0=неділя, 1=понеділок, ... 6=субота

    const { data: couriers, error } = await supabaseAdmin
      .from("couriers")
      .select("full_name, phone, city, weekly_price, subscription_start_date")
      .eq("status", "active")
      .not("subscription_start_date", "is", null);

    if (error) {
      console.error("Cron weekday-report error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const dueToday = (couriers || []).filter((c) => {
      const d = new Date(c.subscription_start_date);
      return d.getDay() === todayWeekday;
    });

    const lutsk = dueToday.filter((c) => c.city === "Луцьк");
    const lviv = dueToday.filter((c) => c.city === "Львів");

    const dateStr = today.toLocaleDateString("uk-UA");
    const dayName = WEEKDAY_NAMES[todayWeekday];

    let text = `📅 <b>Хто платить сьогодні (${dayName}, ${dateStr})</b>\n\n`;

    text += `🔵 <b>Луцьк (${lutsk.length}):</b>\n`;
    if (lutsk.length > 0) {
      for (const c of lutsk) {
        const amount = getWeeklyPrice(c);
        text += `• <b>${c.full_name}</b> — ${c.phone} — ${amount} грн\n`;
      }
    } else {
      text += `Немає активних кур'єрів на сьогодні\n`;
    }

    text += `\n🟢 <b>Львів (${lviv.length}):</b>\n`;
    if (lviv.length > 0) {
      for (const c of lviv) {
        const amount = getWeeklyPrice(c);
        text += `• <b>${c.full_name}</b> — ${c.phone} — ${amount} грн\n`;
      }
    } else {
      text += `Немає активних кур'єрів на сьогодні\n`;
    }

    if (ADMIN_CHAT_ID) {
      await sendMessage(ADMIN_CHAT_ID, text);
    }

    console.log(`Cron weekday-report: lutsk=${lutsk.length}, lviv=${lviv.length}`);
    return NextResponse.json({ ok: true, lutsk: lutsk.length, lviv: lviv.length });
  } catch (error) {
    console.error("Cron weekday-report error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}