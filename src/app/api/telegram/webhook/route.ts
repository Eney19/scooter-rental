import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWeeklyPrice, daysOverdue, totalWithPenalty } from "@/lib/pricing";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId: number, text: string, options?: object) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", ...options }),
  });
}

async function sendMessageWithButton(chatId: number, text: string, buttonText: string, buttonUrl: string) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: buttonText, url: buttonUrl }]],
      },
    }),
  });
}

async function answerCallbackQuery(callbackQueryId: string, text: string) {
  await fetch(`${API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false }),
  });
}

async function editMessageText(chatId: number, messageId: number, text: string) {
  await fetch(`${API}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    // Обробка натискання inline-кнопки (callback_query)
    if (update.callback_query) {
      const query = update.callback_query;
      const callbackData: string = query.data || "";
      const adminChatId = parseInt(ADMIN_CHAT_ID);

      // Перевіряємо що натиснув саме адмін
      if (query.from.id !== adminChatId) {
        await answerCallbackQuery(query.id, "❌ Тільки адмін може позначати платежі");
        return NextResponse.json({ ok: true });
      }

      // Обробка: cash_COURIER_ID
      if (callbackData.startsWith("cash_")) {
        const courierId = callbackData.replace("cash_", "");

        // Отримуємо дані курʼєра
        const { data: courier } = await supabaseAdmin
          .from("couriers")
          .select("full_name, phone, city, weekly_price")
          .eq("id", courierId)
          .single();

        if (!courier) {
          await answerCallbackQuery(query.id, "❌ Курʼєра не знайдено");
          return NextResponse.json({ ok: true });
        }

        const { data: overdueSub } = await supabaseAdmin
          .from("subscriptions")
          .select("expires_at")
          .eq("courier_id", courierId)
          .eq("status", "active")
          .order("expires_at", { ascending: false })
          .limit(1)
          .single();

        const late = overdueSub ? daysOverdue(overdueSub.expires_at) : 0;
        const amount = totalWithPenalty(getWeeklyPrice(courier), late);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        const now = new Date().toISOString();

        // Записуємо готівковий платіж
        await supabaseAdmin.from("payments").insert({
          courier_id: courierId,
          amount,
          type: "weekly_rent",
          status: "success",
          wayforpay_id: `cash_${Date.now()}`,
        });

        // Оновлюємо або створюємо підписку
        const { data: existingSub } = await supabaseAdmin
          .from("subscriptions")
          .select("id")
          .eq("courier_id", courierId)
          .eq("status", "active")
          .single();

        if (existingSub) {
          await supabaseAdmin
            .from("subscriptions")
            .update({ expires_at: expiresAt.toISOString(), paid_at: now, amount })
            .eq("id", existingSub.id);
        } else {
          await supabaseAdmin.from("subscriptions").insert({
            courier_id: courierId,
            amount,
            status: "active",
            expires_at: expiresAt.toISOString(),
            paid_at: now,
            wayforpay_id: `cash_${Date.now()}`,
          });
        }

        // Активуємо кур'єра (важливо для першої оплати одразу після реєстрації)
        await supabaseAdmin
          .from("couriers")
          .update({ status: "active" })
          .eq("id", courierId);

        const paidDate = new Date().toLocaleDateString("uk-UA");
        const nextDate = expiresAt.toLocaleDateString("uk-UA");

        // Відповідаємо на callback
        await answerCallbackQuery(query.id, "✅ Готівковий платіж записано!");

        // Оновлюємо повідомлення (прибираємо кнопку)
        await editMessageText(
          query.message.chat.id,
          query.message.message_id,
          `✅ <b>Готівковий платіж записано</b>\n\n` +
          `Курʼєр: <b>${courier.full_name}</b>\n` +
          `Телефон: ${courier.phone}\n` +
          `Місто: ${courier.city || "—"}\n` +
          `Сума: <b>${amount} грн</b>\n` +
          `Дата оплати: ${paidDate}\n` +
          `Підписка до: <b>${nextDate}</b>`
        );

        // Повідомлення курʼєру якщо він підключений до бота
        const { data: courierFull } = await supabaseAdmin
          .from("couriers")
          .select("telegram_chat_id")
          .eq("id", courierId)
          .single();

        if (courierFull?.telegram_chat_id) {
          await sendMessage(
            courierFull.telegram_chat_id,
            `✅ <b>Оплату підтверджено!</b>\n\n` +
            `Ваш готівковий платіж <b>${amount} грн</b> зараховано.\n` +
            `Підписка активна до <b>${nextDate}</b>.\n\n` +
            `Дякуємо! 🛵`
          );
        }
      }

      return NextResponse.json({ ok: true });
    }

    // Звичайні повідомлення
    const message = update.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = message.chat.id;
    const text = message.text || "";
    const phone = message.contact?.phone_number;

    // Команда /start
    if (text.startsWith("/start")) {
      await sendMessage(chatId,
        `👋 Вітаємо в <b>PowerDrive</b>!\n\n` +
        `Цей бот допоможе вам:\n` +
        `• Отримувати нагадування про оплату\n` +
        `• Оплачувати оренду скутера\n` +
        `• Перевіряти статус підписки\n\n` +
        `Для початку поділіться своїм номером телефону:`,
        {
          reply_markup: {
            keyboard: [[{ text: "📱 Поділитися номером", request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
      return NextResponse.json({ ok: true });
    }

    // Отримали контакт
    if (phone) {
      const normalizedPhone = phone.startsWith("+") ? phone : "+" + phone;

      const { data: courier } = await supabaseAdmin
        .from("couriers")
        .select("id, full_name, status")
        .eq("phone", normalizedPhone)
        .single();

      if (!courier) {
        await sendMessage(chatId,
          `❌ Ваш номер <b>${normalizedPhone}</b> не знайдено в системі.\n\n` +
          `Зареєструйтесь спочатку на сайті PowerDrive.`
        );
        return NextResponse.json({ ok: true });
      }

      await supabaseAdmin
        .from("couriers")
        .update({ telegram_chat_id: chatId })
        .eq("id", courier.id);

      await sendMessage(chatId,
        `✅ <b>${courier.full_name}</b>, вас успішно підключено!\n\n` +
        `Тепер ви будете отримувати нагадування про оплату оренди.\n\n` +
        `Доступні команди:\n` +
        `/status — статус підписки\n` +
        `/pay — оплатити оренду`
      );
      return NextResponse.json({ ok: true });
    }

    // Команда /status
    if (text.startsWith("/status")) {
      const { data: courier, error: courierError } = await supabaseAdmin
        .from("couriers")
        .select("id, full_name, status, subscriptions(status, expires_at, amount)")
        .eq("telegram_chat_id", chatId)
        .single();

      if (courierError) console.error("Supabase /status query error:", courierError);

      if (!courier) {
        await sendMessage(chatId, "❌ Спочатку зареєструйтесь командою /start");
        return NextResponse.json({ ok: true });
      }

      const subs = (courier.subscriptions as any[]) || [];
      const sub = subs
        .filter((s) => s.status === "active")
        .sort((a, b) => new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime())[0];

      if (!sub) {
        await sendMessage(chatId,
          `📋 <b>Статус:</b> Немає активної підписки\n\n` +
          `Натисніть /pay щоб оплатити оренду`
        );
      } else {
        const nextDate = new Date(sub.expires_at).toLocaleDateString("uk-UA");
        await sendMessage(chatId,
          `✅ <b>Підписка активна</b>\n\n` +
          `💰 Сума: <b>${sub.amount} грн/тиждень</b>\n` +
          `📅 Діє до: <b>${nextDate}</b>`
        );
      }
      return NextResponse.json({ ok: true });
    }

    // Команда /pay
    if (text.startsWith("/pay")) {
      const { data: courier } = await supabaseAdmin
        .from("couriers")
        .select("id, full_name, city, weekly_price")
        .eq("telegram_chat_id", chatId)
        .single();

      if (!courier) {
        await sendMessage(chatId, "❌ Спочатку зареєструйтесь командою /start");
        return NextResponse.json({ ok: true });
      }

      const { data: overdueSubForPay } = await supabaseAdmin
        .from("subscriptions")
        .select("expires_at")
        .eq("courier_id", courier.id)
        .eq("status", "active")
        .order("expires_at", { ascending: false })
        .limit(1)
        .single();

      const lateForPay = overdueSubForPay ? daysOverdue(overdueSubForPay.expires_at) : 0;
      const weeklyPrice = totalWithPenalty(getWeeklyPrice(courier), lateForPay);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://powerdrive.in.ua";

      await sendMessageWithButton(
        chatId,
        `💳 <b>Оплата оренди електроскутера</b>\n\n` +
        `Сума: <b>${weeklyPrice} грн</b> за 7 днів\n\n` +
        `Натисніть кнопку нижче для оплати:`,
        `💳 Оплатити ${weeklyPrice} грн`,
        `${appUrl}/payment/${courier.id}`
      );
      return NextResponse.json({ ok: true });
    }

    // Невідома команда
    await sendMessage(chatId,
      `Доступні команди:\n` +
      `/start — реєстрація\n` +
      `/status — статус підписки\n` +
      `/pay — оплатити оренду`
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}