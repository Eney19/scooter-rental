import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWeeklyPrice, daysOverdue, totalWithPenalty, getDepositAmount, getBatteryWeeklyPrice } from "@/lib/pricing";
import { nextExpiryFrom, isFirstPayment, activateCourier } from "@/lib/subscription";
import { openRentalPeriod } from "@/lib/rental-history";
import { getAdminChatIds } from "@/lib/telegram";
import { normalizePhone } from "@/lib/phone";
import { handleCourierText, handleCourierCallback, sendCourierMenu } from "@/lib/courier-bot";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId: number, text: string, options?: object) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", ...options }),
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
      // Кнопки курʼєра в боті ("c:...") — окрема гілка, доступна всім
      // підключеним курʼєрам; адмінська перевірка нижче їх не стосується.
      if (await handleCourierCallback(query)) {
        return NextResponse.json({ ok: true });
      }

      const adminChatIds = getAdminChatIds();

      // Перевіряємо що натиснув саме адмін (будь-хто зі списку)
      if (!adminChatIds.includes(query.from.id)) {
        await answerCallbackQuery(query.id, "❌ Тільки адмін може позначати платежі");
        return NextResponse.json({ ok: true });
      }

      // Обробка: cash_COURIER_ID
      if (callbackData.startsWith("cash_")) {
        const courierId = callbackData.replace("cash_", "");

        // Отримуємо дані курʼєра
        const { data: courier } = await supabaseAdmin
          .from("couriers")
          .select("full_name, phone, city, weekly_price, scooter_model, battery_types, contract_signed_at")
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
        const rentAmount = totalWithPenalty(getWeeklyPrice(courier), late);
        // Завдаток за скутер — лише при першій оплаті кур'єра, залежить від міста.
        const firstPayment = await isFirstPayment(courierId);
        const deposit = firstPayment ? getDepositAmount(courier.city) : 0;
        const batteryAmount = getBatteryWeeklyPrice(courier.battery_types);
        const scooterAmount = rentAmount - batteryAmount;
        const amount = rentAmount + deposit;
        const now = new Date().toISOString();

        const paymentParts: string[] = [`оренда скутера ${scooterAmount} грн`];
        if (batteryAmount > 0) paymentParts.push(`оренда акумулятора ${batteryAmount} грн`);
        if (deposit > 0) paymentParts.push(`завдаток за скутер ${deposit} грн`);
        const paymentBreakdown = paymentParts.length > 1 ? paymentParts.join(" + ") : null;

        // Записуємо готівковий платіж. Раніше цей insert ніхто не
        // перевіряв: якщо Supabase повертав помилку, код мовчки йшов далі,
        // адмін в Telegram бачив "✅ Готівковий платіж записано", а в базі
        // не з'являлось НІЧОГО (той самий клас багу, що знайшли й
        // виправили в адмінському /api/admin/cash-payment — тут він досі
        // був живий). Тепер при збої одразу зупиняємось і повідомляємо.
        const { error: paymentInsertError } = await supabaseAdmin.from("payments").insert({
          courier_id: courierId,
          amount,
          deposit,
          battery_amount: batteryAmount,
          type: "weekly_rent",
          status: "success",
          wayforpay_id: `cash_${Date.now()}`,
        });

        if (paymentInsertError) {
          console.error("telegram webhook cash_: payments insert failed", paymentInsertError, "courierId:", courierId);
          for (const chatId of getAdminChatIds()) {
            await sendMessage(
              chatId,
              `⚠️ <b>Не вдалося записати готівковий платіж</b>\n\n` +
              `Кур'єр: <b>${courier.full_name}</b> (${courier.phone})\n` +
              `Помилка: ${paymentInsertError.message}\n\n` +
              `Нічого не записано в базу — спробуйте ще раз або внесіть оплату вручну в адмінці.`
            );
          }
          await answerCallbackQuery(query.id, "❌ Помилка запису платежу — дивіться Telegram");
          return NextResponse.json({ ok: true });
        }

        // Оновлюємо або створюємо підписку. Той самий принцип, що й у
        // monopay-вебхуку: якщо активна підписка ще не спливла (оплата
        // наперед) — 7 днів рахуються від її expires_at, а не від зараз.
        const { data: existingSub } = await supabaseAdmin
          .from("subscriptions")
          .select("id, expires_at")
          .eq("courier_id", courierId)
          .eq("status", "active")
          .maybeSingle();

        const expiresAt = nextExpiryFrom(existingSub?.expires_at);

        let subscriptionError = null;
        if (existingSub) {
          ({ error: subscriptionError } = await supabaseAdmin
            .from("subscriptions")
            .update({ expires_at: expiresAt.toISOString(), paid_at: now, amount })
            .eq("id", existingSub.id));
        } else {
          ({ error: subscriptionError } = await supabaseAdmin.from("subscriptions").insert({
            courier_id: courierId,
            amount,
            status: "active",
            expires_at: expiresAt.toISOString(),
            paid_at: now,
            wayforpay_id: `cash_${Date.now()}`,
          }));
        }

        if (subscriptionError) {
          console.error("telegram webhook cash_: subscription upsert failed", subscriptionError, "courierId:", courierId);
        }

        // Активуємо кур'єра (важливо для першої оплати одразу після реєстрації).
        // Дату старту підписки фіксуємо лише при фактичному новому взятті
        // скутера (не при оплаті наперед активної підписки).
        const { ok: activated, error: activateError } = await activateCourier(courierId, {
          registration_step: 3,
          debt_since: null,
          debt_amount: null,
          debt_auto: false,
          ...(!existingSub ? { subscription_start_date: now } : {}),
        });

        if (!activated || subscriptionError) {
          for (const chatId of getAdminChatIds()) {
            await sendMessage(
              chatId,
              `⚠️ <b>Готівковий платіж записано не повністю</b>\n\n` +
              `Кур'єр: <b>${courier.full_name}</b> (${courier.phone})\n` +
              `Платіж (${amount} грн) записано.\n` +
              (subscriptionError ? `Підписку не вдалось оновити: ${subscriptionError.message}.\n` : "") +
              (!activated ? `couriers.status не вдалось виставити "active": ${activateError}.\n` : "") +
              `\nПеревірте вручну в адмінці.`
            );
          }
        }

        // Так само як в інших платіжних обробниках: новий період оренди
        // відкриваємо лише якщо це фактичне взяття скутера, а не оплата
        // наперед активної підписки.
        if (!existingSub) {
          await openRentalPeriod(courierId, {
            city: courier.city ?? null,
            scooterModel: courier.scooter_model ?? null,
            batteryTypes: courier.battery_types ?? null,
            weeklyPrice: courier.weekly_price ?? null,
            contractSignedAt: courier.contract_signed_at ?? null,
          });
        }

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
          (paymentBreakdown
            ? `${paymentBreakdown}\n` +
              `Сума: <b>${amount} грн</b>\n`
            : `Сума: <b>${amount} грн</b>\n`) +
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
            (paymentBreakdown
              ? `${paymentBreakdown} — зараховано <b>${amount} грн</b>.\n`
              : `Ваш готівковий платіж <b>${amount} грн</b> зараховано.\n`) +
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

    // Команда /id — самообслуговування: показує chat_id цього чату, щоб
    // додати нову людину до списку адміністраторів (ADMIN_TELEGRAM_CHAT_ID)
    // без порпання в логах чи API Telegram.
    if (text.startsWith("/id")) {
      const username = message.from?.username ? `@${message.from.username}` : "—";
      await sendMessage(
        chatId,
        `🆔 Ваш chat_id: <code>${chatId}</code>\nUsername: ${username}\n\n` +
        `Щоб отримувати адмінські сповіщення PowerDrive, цей chat_id треба додати в змінну середовища ADMIN_TELEGRAM_CHAT_ID (через кому, якщо їх кілька).`
      );
      return NextResponse.json({ ok: true });
    }

    // Команда /start — з диплінка (t.me/<bot>?start=<courierId>) підключаємо
    // одразу за courierId, без ручного ділення номером телефону. Якщо
    // payload відсутній або не знайдено — падаємо в старий flow нижче
    // (запит номера через кнопку "Поділитися номером").
    if (text.startsWith("/start")) {
      const startPayload = text.slice("/start".length).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(startPayload);

      if (isUuid) {
        const { data: courierByLink } = await supabaseAdmin
          .from("couriers")
          .select("id, full_name, telegram_connected_at")
          .eq("id", startPayload)
          .maybeSingle();

        if (courierByLink) {
          await supabaseAdmin
            .from("couriers")
            .update({
              telegram_chat_id: chatId,
              ...(courierByLink.telegram_connected_at ? {} : { telegram_connected_at: new Date().toISOString() }),
            })
            .eq("id", courierByLink.id);

          await sendCourierMenu(chatId,
            `✅ <b>${courierByLink.full_name}</b>, вас успішно підключено!\n\n` +
            `Тут ви можете оплатити оренду (онлайн, готівкою чи наперед), переглянути історію оплат, ` +
            `договір, змінити тариф та отримувати нагадування.\n\n` +
            `Натисніть «💳 Оплатити» в меню нижче, щоб розпочати.`
          );
          return NextResponse.json({ ok: true });
        }
      }

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
      const normalizedPhone = normalizePhone(phone);

      const { data: courier } = await supabaseAdmin
        .from("couriers")
        .select("id, full_name, status, telegram_connected_at")
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
        .update({
          telegram_chat_id: chatId,
          ...(courier.telegram_connected_at ? {} : { telegram_connected_at: new Date().toISOString() }),
        })
        .eq("id", courier.id);

      await sendCourierMenu(chatId,
        `✅ <b>${courier.full_name}</b>, вас успішно підключено!\n\n` +
        `Тут ви можете оплатити оренду (онлайн, готівкою чи наперед), переглянути історію оплат, ` +
        `договір, змінити тариф та отримувати нагадування.\n\n` +
        `Натисніть «💳 Оплатити» в меню нижче, щоб розпочати.`
      );
      return NextResponse.json({ ok: true });
    }

    // Усе, що стосується підключеного курʼєра (/status, /pay, /history, /docs,
    // /rentals, кнопки меню, введення ціни) — в lib/courier-bot.
    if (await handleCourierText(chatId, text)) {
      return NextResponse.json({ ok: true });
    }

    // Невідома команда
    await sendMessage(chatId,
      `Щоб підключитися, відкрийте посилання з сторінки підписання договору ` +
      `або натисніть /start і поділіться номером телефону.`
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}