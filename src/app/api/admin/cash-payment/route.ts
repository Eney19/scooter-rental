import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWeeklyPrice, daysOverdue, totalWithPenalty, getDepositAmount, getBatteryWeeklyPrice } from "@/lib/pricing";
import { nextExpiryFrom, isFirstPayment, activateCourier } from "@/lib/subscription";
import { openRentalPeriod } from "@/lib/rental-history";
import { getAdminChatIds } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  try {
    const { courierId, paidAt, rentAmount: rentOverride, deposit: depositOverride } = await req.json();

    if (!courierId) {
      return NextResponse.json({ success: false, error: "courierId is required" }, { status: 400 });
    }

    const { data: courier } = await supabaseAdmin
      .from("couriers")
      .select("full_name, phone, city, weekly_price, scooter_model, battery_types, contract_signed_at")
      .eq("id", courierId)
      .single();

    if (!courier) {
      return NextResponse.json({ success: false, error: "Курʼєра не знайдено" }, { status: 404 });
    }

    const { data: overdueSub } = await supabaseAdmin
      .from("subscriptions")
      .select("expires_at")
      .eq("courier_id", courierId)
      .eq("status", "active")
      .order("expires_at", { ascending: false })
     .single();

    const late = overdueSub ? daysOverdue(overdueSub.expires_at) : 0;
    // Завдаток за скутер стягується лише при першій оплаті кур'єра (як і в
    // онлайн-оплаті), і теж залежить від міста. Адмін бачить ці суми
    // заздалегідь (cash-payment-preview) і може їх відредагувати — якщо
    // передані rentOverride/depositOverride, довіряємо їм замість перерахунку.
    const firstPayment = await isFirstPayment(courierId);
    const rentAmount = typeof rentOverride === "number" ? rentOverride : totalWithPenalty(getWeeklyPrice(courier), late);
    const deposit = typeof depositOverride === "number" ? depositOverride : (firstPayment ? getDepositAmount(courier.city) : 0);
    const batteryAmount = getBatteryWeeklyPrice(courier.battery_types);
    const scooterAmount = rentAmount - batteryAmount;
    const amount = rentAmount + deposit;
    // Дата, яку адмін вказав як фактичну дату готівкової оплати (може бути
    // заднім числом); якщо не передано — поточний момент.
    const paidAtDate = paidAt ? new Date(paidAt) : new Date();
    const now = paidAtDate.toISOString();

    const paymentParts: string[] = [`оренда скутера ${scooterAmount} грн`];
    if (batteryAmount > 0) paymentParts.push(`оренда акумулятора ${batteryAmount} грн`);
    if (deposit > 0) paymentParts.push(`завдаток за скутер ${deposit} грн`);
    const paymentBreakdown = paymentParts.length > 1 ? paymentParts.join(" + ") : null;

    await supabaseAdmin.from("payments").insert({
      courier_id: courierId,
      amount,
      deposit,
      battery_amount: batteryAmount,
      type: "weekly_rent",
      status: "success",
      wayforpay_id: `cash_${Date.now()}`,
      created_at: now,
    });

    const { data: existingSub } = await supabaseAdmin
      .from("subscriptions")
      .select("id, expires_at")
      .eq("courier_id", courierId)
      .eq("status", "active")
      .single();

    // Той самий принцип, що і для monopay-вебхука: продовжуємо від поточного
    // expires_at, якщо він ще в майбутньому (оплата наперед), інакше — від
    // вказаної дати оплати (paidAtDate, а не обов'язково "зараз").
    const expiresAt = nextExpiryFrom(existingSub?.expires_at, paidAtDate);

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

    // Фіксуємо дату старту підписки лише при фактичному новому взятті скутера
    // (не при оплаті наперед активної підписки) — визначає день тижня для
    // щотижневого нагадування "хто платить сьогодні".
    const { ok: activated, error: activateError } = await activateCourier(courierId, {
      registration_step: 3,
      debt_since: null,
      debt_amount: null,
      debt_auto: false,
      ...(!existingSub ? { subscription_start_date: now } : {}),
    });

    if (!activated) {
      const adminChatIds = getAdminChatIds();
      const BOT_TOKEN_FOR_ALERT = process.env.TELEGRAM_BOT_TOKEN;
      if (adminChatIds.length > 0 && BOT_TOKEN_FOR_ALERT) {
        try {
          for (const chatId of adminChatIds) {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN_FOR_ALERT}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                parse_mode: "HTML",
                text:
                  `⚠️ <b>Платіж записано, але статус кур'єра не оновився</b>\n\n` +
                  `Кур'єр: <b>${courier.full_name}</b> (${courier.phone})\n` +
                  `Платіж і підписка (${amount} грн) записані успішно, але couriers.status не вдалось виставити "active": ${activateError}.\n\n` +
                  `Перевірте вручну в адмінці.`,
              }),
            });
          }
        } catch (e) {
          console.error("admin cash-payment: failed to notify admin about activation failure", e);
        }
      }
    }

    // Так само як в monopay-вебхуку: новий період оренди відкриваємо лише
    // якщо це фактичне взяття скутера, а не оплата наперед активної підписки.
    if (!existingSub) {
      await openRentalPeriod(courierId, {
        city: courier.city ?? null,
        scooterModel: courier.scooter_model ?? null,
        batteryTypes: courier.battery_types ?? null,
        weeklyPrice: courier.weekly_price ?? null,
        contractSignedAt: courier.contract_signed_at ?? null,
      });
    }

    const { data: courierFull } = await supabaseAdmin
      .from("couriers")
      .select("telegram_chat_id")
      .eq("id", courierId)
      .single();

    if (courierFull?.telegram_chat_id) {
      const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      const nextDate = expiresAt.toLocaleDateString("uk-UA");
      if (BOT_TOKEN) {
        try {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: courierFull.telegram_chat_id,
              parse_mode: "HTML",
              text:
                `✅ <b>Оплату підтверджено!</b>\n\n` +
                (paymentBreakdown
                  ? `Ваш готівковий платіж прийнято: ${paymentBreakdown} = <b>${amount} грн</b>.\n\n`
                  : `Ваш готівковий платіж <b>${amount} грн</b> прийнято.\n\n`) +
                `Підписка активна до <b>${nextDate}</b>.\n\n` +
                `Дякуємо! 🛵`,
            }),
          });
        } catch (e) {
          console.error("Telegram notify error", e);
        }
      }
    }

    return NextResponse.json({
      success: true,
      amount,
      expiresAt: expiresAt.toISOString(),
      telegramLinked: !!courierFull?.telegram_chat_id,
      botUsername: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "powerdrive_scooter_bot",
    });
  } catch (error) {
    console.error("admin cash-payment error", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
