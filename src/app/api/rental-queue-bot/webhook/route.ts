import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAdminChatIds } from "@/lib/telegram";

// Окремий бот для швидкого внесення "черги" на оренду адміном Андрієм:
// натиснув місто → ввів ПІБ → запис одразу з'являється в адмінці на
// вкладці "Черга". Власний токен (RENTAL_QUEUE_BOT_TOKEN), НЕ той самий,
// що в основного бота (TELEGRAM_BOT_TOKEN) — це окремий Telegram-бот.
const BOT_TOKEN = process.env.RENTAL_QUEUE_BOT_TOKEN!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const CITIES = ["Луцьк", "Рівне", "Львів"];

async function sendMessage(chatId: number, text: string, options?: object) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", ...options }),
  });
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await fetch(`${API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false }),
  });
}

function cityKeyboard() {
  return {
    inline_keyboard: [CITIES.map((city) => ({ text: city, callback_data: `qcity_${city}` }))],
  };
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    const adminChatIds = getAdminChatIds();

    // Натискання кнопки міста
    if (update.callback_query) {
      const query = update.callback_query;
      const chatId: number = query.message.chat.id;

      if (!adminChatIds.includes(query.from.id)) {
        await answerCallbackQuery(query.id, "❌ Тільки адмін може додавати в чергу");
        return NextResponse.json({ ok: true });
      }

      const callbackData: string = query.data || "";
      if (callbackData.startsWith("qcity_")) {
        const city = callbackData.replace("qcity_", "");

        const { error } = await supabaseAdmin
          .from("rental_queue_pending")
          .upsert({ chat_id: chatId, city, created_at: new Date().toISOString() }, { onConflict: "chat_id" });

        if (error) {
          console.error("rental-queue-bot: pending upsert failed", error, "chatId:", chatId);
          await answerCallbackQuery(query.id, "❌ Помилка, спробуйте ще раз");
          return NextResponse.json({ ok: true });
        }

        await answerCallbackQuery(query.id, `Місто: ${city}`);
        await sendMessage(chatId, `Місто: <b>${city}</b>\nНадішліть ПІБ кур'єра:`);
      }

      return NextResponse.json({ ok: true });
    }

    // Звичайні повідомлення
    const message = update.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId: number = message.chat.id;
    const text: string = (message.text || "").trim();

    if (!adminChatIds.includes(message.from.id)) {
      await sendMessage(chatId, "❌ Цей бот доступний лише адміністраторам PowerDrive.");
      return NextResponse.json({ ok: true });
    }

    if (text === "/start") {
      await sendMessage(
        chatId,
        "👋 Швидке внесення в чергу на оренду.\n\nОберіть місто:",
        { reply_markup: cityKeyboard() }
      );
      return NextResponse.json({ ok: true });
    }

    // Чи є незавершений діалог "місто обрано, чекаємо ПІБ" для цього чату
    const { data: pending } = await supabaseAdmin
      .from("rental_queue_pending")
      .select("city")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (!pending) {
      await sendMessage(chatId, "Спочатку оберіть місто:", { reply_markup: cityKeyboard() });
      return NextResponse.json({ ok: true });
    }

    if (!text) {
      await sendMessage(chatId, "Надішліть, будь ласка, ПІБ кур'єра текстом:");
      return NextResponse.json({ ok: true });
    }

    const { error: insertError } = await supabaseAdmin.from("rental_queue").insert({
      city: pending.city,
      full_name: text,
      created_by_username: message.from?.username ? `@${message.from.username}` : null,
    });

    if (insertError) {
      console.error("rental-queue-bot: rental_queue insert failed", insertError, "chatId:", chatId);
      await sendMessage(chatId, "❌ Не вдалося додати запис, спробуйте ще раз.");
      return NextResponse.json({ ok: true });
    }

    await supabaseAdmin.from("rental_queue_pending").delete().eq("chat_id", chatId);

    await sendMessage(
      chatId,
      `✅ Додано в чергу: <b>${text}</b> — ${pending.city}\n\nОберіть місто для наступного запису:`,
      { reply_markup: cityKeyboard() }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("rental-queue-bot webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}
