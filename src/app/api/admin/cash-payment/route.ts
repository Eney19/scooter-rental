import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWeeklyPrice, daysOverdue, resolveDeposit, getBatteryWeeklyPrice, calculateDebtSince, splitRentForDisplay, batteryAmountForLedger, computePaidThrough, PENALTY_PAYMENT_TYPE } from "@/lib/pricing";
import { loadCourierDebtLedger } from "@/lib/debt";
import { activateCourier } from "@/lib/subscription";
import { openRentalPeriod, shouldChargeDeposit } from "@/lib/rental-history";
import { getAdminChatIds } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  try {
    const { courierId, paidAt, rentAmount: rentOverride, deposit: depositOverride, penalty: penaltyOverride } = await req.json();

    if (!courierId) {
      return NextResponse.json({ success: false, error: "courierId is required" }, { status: 400 });
    }

    const { data: courier } = await supabaseAdmin
      .from("couriers")
      .select("full_name, phone, city, weekly_price, rental_type, scooter_model, battery_types, contract_signed_at, no_penalty, debt_since, debt_auto, subscription_start_date, deposit_amount")
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
      .limit(1)
      .maybeSingle();

    const late = overdueSub ? daysOverdue(overdueSub.expires_at) : 0;
    // Завдаток за скутер стягується на кожне нове взяття скутера (коли в
    // кур'єра зараз немає відкритого періоду оренди) — так само і в
    // онлайн-оплаті, і теж залежить від міста. Адмін бачить ці суми
    // заздалегідь (cash-payment-preview) і може їх відредагувати — якщо
    // передані rentOverride/depositOverride, довіряємо їм замість перерахунку.
    const firstPayment = await shouldChargeDeposit(courierId);
    // Чи покриває фактично прийнята сума ВЕСЬ нарахований прострочений борг
    // (а не лише стільки, скільки кур'єр зараз зміг заплатити). Раніше будь-
    // який готівковий платіж, навіть менший за реально нараховане, одразу
    // посував підписку на весь прострочений період і обнуляв борг — ніби
    // оплачено повністю (саме так 2800 грн за 36 днів прострочення стерли
    // борг у ~16 150 грн). Якщо курʼєр прострочив (late > 0) — "скільки
    // всього він винен" тепер береться з повної історії платежів
    // (Нараховано − Оплачено + Пеня, calculateDebtLedger/loadCourierDebtLedger),
    // а не лише з поточного тижня; якщо ще не прострочив (нове взяття або
    // оплата наперед) — як і раніше, це просто рівно один тижневий тариф.
    // Пеня рахується й записується ОКРЕМО від оренди (окремий платіж з
    // type "penalty") — вона не повинна перетворюватись на "оплачені" дні.
    const debtLedger = late > 0
      ? await loadCourierDebtLedger(courierId, getWeeklyPrice(courier), courier.subscription_start_date, null, !!courier.no_penalty, resolveDeposit(courier, true))
      : null;
    const fullRentOwed = debtLedger ? debtLedger.remainingDebt : getWeeklyPrice(courier);
    const rentAmount = typeof rentOverride === "number" ? rentOverride : fullRentOwed;
    const deposit = typeof depositOverride === "number" ? depositOverride : resolveDeposit(courier, firstPayment);
    const batteryAmount = getBatteryWeeklyPrice(courier.battery_types);
    // Акумулятор входить у загальний тариф (getWeeklyPrice) — уся сума оренди
    // рахується в оплачені дні.
    const rentForDays = rentAmount;
    const amount = rentAmount + deposit;
    const penaltyAmount = Math.max(0, typeof penaltyOverride === "number" ? penaltyOverride : (debtLedger ? debtLedger.penalty : 0));
    const totalAmount = amount + penaltyAmount;
    // Лише для повідомлення курʼєру/в лог — не бере участі в розрахунку дат.
    const displaySplit = splitRentForDisplay(courier.rental_type, rentAmount, batteryAmount);
    // Дата, яку адмін вказав як фактичну дату готівкової оплати (може бути
    // заднім числом); якщо не передано — поточний момент.
    const paidAtDate = paidAt ? new Date(paidAt) : new Date();
    const now = paidAtDate.toISOString();

    const paymentParts: string[] = [];
    if (displaySplit.scooterAmount > 0) paymentParts.push(`оренда скутера ${displaySplit.scooterAmount} грн`);
    if (displaySplit.batteryAmount > 0) paymentParts.push(`оренда акумулятора ${displaySplit.batteryAmount} грн`);
    if (deposit > 0) paymentParts.push(`завдаток за скутер ${deposit} грн`);
    if (penaltyAmount > 0) paymentParts.push(`пеня ${penaltyAmount} грн`);
    const paymentBreakdown = paymentParts.length > 0 ? paymentParts.join(" + ") : null;

    const { error: paymentInsertError } = await supabaseAdmin.from("payments").insert({
      courier_id: courierId,
      amount,
      deposit,
      battery_amount: batteryAmountForLedger(courier.rental_type, batteryAmount),
      type: "weekly_rent",
      status: "success",
      wayforpay_id: `cash_${Date.now()}`,
      created_at: now,
    });

    if (paymentInsertError) {
      // КРИТИЧНО: раніше цей insert ніхто не перевіряв — якщо він падав,
      // код все одно доходив до кінця і повертав success:true, тож адмін
      // бачив "Готівковий платіж записано", а в базі не з'являлось НІЧОГО
      // (саме це сталося з Чорнобривцем Андрієм Олексійовичем). Тепер при
      // збої одразу зупиняємось і чесно повідомляємо адміну про помилку.
      console.error("admin cash-payment: payments insert failed", paymentInsertError, "courierId:", courierId);
      return NextResponse.json(
        { success: false, error: `Не вдалося записати платіж: ${paymentInsertError.message}` },
        { status: 500 }
      );
    }

    if (penaltyAmount > 0) {
      const { error: penaltyInsertError } = await supabaseAdmin.from("payments").insert({
        courier_id: courierId,
        amount: penaltyAmount,
        deposit: 0,
        battery_amount: 0,
        type: PENALTY_PAYMENT_TYPE,
        status: "success",
        wayforpay_id: `cash_penalty_${Date.now()}`,
        created_at: now,
      });
      if (penaltyInsertError) {
        console.error("admin cash-payment: penalty insert failed", penaltyInsertError, "courierId:", courierId);
        return NextResponse.json(
          { success: false, error: `Оренду записано, але не вдалося записати пеню (${penaltyAmount} грн): ${penaltyInsertError.message}. Додайте її ще раз окремо.` },
          { status: 500 }
        );
      }
    }

    const { data: existingSub } = await supabaseAdmin
      .from("subscriptions")
      .select("id, expires_at")
      .eq("courier_id", courierId)
      .eq("status", "active")
      .maybeSingle();

    // "Оплачено до" рахуємо з УСІЄЇ історії успішних платежів від дати
    // старту підписки (computePaidThrough, @/lib/pricing — та сама формула,
    // що й в адмінці): кожен платіж додає стільки днів, скільки реально
    // покриває його сума за денним тарифом. Раніше повна оплата завжди
    // посувала дату рівно на тиждень незалежно від суми (наприклад, 4200 грн
    // = 2 тижні давали лише +7 днів), а відлік не враховував вручну
    // виставлену дату старту — ручне відтворення історії оплат давало
    // неправильне "Оплачено до" (Галас Володимир Сергійович, 28.11.2026).
    // Нове взяття (активної підписки ще нема) — дата старту = дата цієї
    // оплати, як і раніше (нижче її записуємо в couriers).
    const subscriptionStart = existingSub ? courier.subscription_start_date : now;
    let expiresAt: Date | null = null;
    if (subscriptionStart) {
      const { data: historyRows } = await supabaseAdmin
        .from("payments")
        .select("id, amount, deposit, battery_amount, created_at, status, type")
        .eq("courier_id", courierId)
        .eq("status", "success");
      expiresAt = computePaidThrough(historyRows || [], getWeeklyPrice(courier), courier.rental_type, subscriptionStart);
    }
    if (!expiresAt) {
      // Запасний варіант (немає дати старту в старих записах): від поточного
      // expires_at або від дати оплати + оплачені дні.
      const dayRate = getWeeklyPrice(courier) / 7;
      const daysCovered = dayRate > 0 ? Math.max(0, Math.floor(rentForDays / dayRate)) : 0;
      const baseExpiry = existingSub?.expires_at ? new Date(existingSub.expires_at) : paidAtDate;
      expiresAt = new Date(baseExpiry);
      expiresAt.setDate(expiresAt.getDate() + daysCovered);
    }

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
      // Платіж уже записано (payments insert вище пройшов) — тут не
      // зупиняємось повністю (гроші кур'єр реально приніс), але обов'язково
      // повідомляємо адміна, щоб підписку/статус поправили вручну, а не
      // мовчки лишали неузгоджений стан.
      console.error("admin cash-payment: subscription upsert failed", subscriptionError, "courierId:", courierId);
    }

    // Фіксуємо дату старту підписки лише при фактичному новому взятті скутера
    // (не при оплаті наперед активної підписки) — визначає день тижня для
    // щотижневого нагадування "хто платить сьогодні".
    let activated: boolean;
    let activateError: string | null;
    let remainingDebtAmount = 0;
    // Лишається боржником, якщо після цієї оплати оплачений період (з усієї
    // історії від дати старту) все одно вже скінчився — незалежно від того,
    // чи вважалась саме ця оплата "частковою".
    const stillOverdueAfterPayment = daysOverdue(expiresAt) > 0;

    if (stillOverdueAfterPayment) {
      // Часткова оплата, що не закриває весь борг: кур'єр лишається
      // "Боржником" — не викликаємо activateCourier (він завжди ставить
      // status:"active"), а рахуємо залишок боргу так само, як щоденний
      // debtor-check cron: debt_since зберігаємо, якщо вже був зафіксований
      // (щоб пеня рахувалась від справжнього початку боргу, а не щоразу
      // обнулялась новим частковим платежем), інакше фіксуємо щойно.
      const debtSince = (courier.debt_since && courier.debt_auto !== false)
        ? courier.debt_since
        : calculateDebtSince(expiresAt).toISOString();
      remainingDebtAmount = (await loadCourierDebtLedger(
        courierId,
        getWeeklyPrice(courier),
        courier.subscription_start_date ?? now,
        null,
        !!courier.no_penalty,
        resolveDeposit(courier, true)
      )).totalOwed;

      const { data: debtRows, error: debtError } = await supabaseAdmin
        .from("couriers")
        .update({
          status: "debtor",
          registration_step: 3,
          debt_since: debtSince,
          debt_amount: remainingDebtAmount,
          debt_auto: true,
          ...(!existingSub ? { subscription_start_date: now } : {}),
        })
        .eq("id", courierId)
        .select("id");
      activated = !debtError && !!debtRows && debtRows.length > 0;
      activateError = debtError ? debtError.message : (!activated ? "0 rows updated" : null);
    } else {
      ({ ok: activated, error: activateError } = await activateCourier(courierId, {
        registration_step: 3,
        debt_since: null,
        debt_amount: null,
        debt_auto: false,
        ...(!existingSub ? { subscription_start_date: now } : {}),
      }));
    }

    if (!activated || subscriptionError) {
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
                  `⚠️ <b>Готівковий платіж записано не повністю</b>\n\n` +
                  `Кур'єр: <b>${courier.full_name}</b> (${courier.phone})\n` +
                  `Платіж (${totalAmount} грн) записано.\n` +
                  (subscriptionError ? `Підписку не вдалось оновити: ${subscriptionError.message}.\n` : "") +
                  (!activated ? `couriers.status не вдалось виставити "active": ${activateError}.\n` : "") +
                  `\nПеревірте вручну в адмінці.`,
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
        // Для "тільки акумулятор" скутера фактично нема — не записуємо
        // застаріле/випадкове значення couriers.scooter_model в історію.
        scooterModel: courier.rental_type === "battery_only" ? null : (courier.scooter_model ?? null),
        batteryTypes: courier.battery_types ?? null,
        // getWeeklyPrice(), а не сире courier.weekly_price — інакше для
        // "тільки акумулятор" в історію потрапляє застаріла ціна скутера
        // замість реального тарифу акумулятора.
        weeklyPrice: getWeeklyPrice(courier),
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
          const paidLine = paymentBreakdown
            ? `Ваш готівковий платіж прийнято: ${paymentBreakdown} = <b>${totalAmount} грн</b>.\n\n`
            : `Ваш готівковий платіж <b>${totalAmount} грн</b> прийнято.\n\n`;
          // Часткова оплата, що не закрила весь прострочений період — чесно
          // кажемо курʼєру, скільки ще лишилось, а не "підписка активна",
          // коли дата, на яку вона посунулась, усе ще в минулому.
          const statusText = stillOverdueAfterPayment
            ? `Це часткова оплата — вона не покриває весь борг.\n` +
              `Залишок заборгованості: <b>${remainingDebtAmount} грн</b>. Погасіть якнайшвидше, щоб уникнути подальшої пені.`
            : `Підписка активна до <b>${nextDate}</b>.\n\n` +
              `Дякуємо! 🛵`;
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: courierFull.telegram_chat_id,
              parse_mode: "HTML",
              text: `✅ <b>Оплату отримано!</b>\n\n` + paidLine + statusText,
            }),
          });
        } catch (e) {
          console.error("Telegram notify error", e);
        }
      }
    }

    return NextResponse.json({
      success: true,
      amount: totalAmount,
      expiresAt: expiresAt.toISOString(),
      telegramLinked: !!courierFull?.telegram_chat_id,
      botUsername: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "powerdrive_scooter_bot",
    });
  } catch (error) {
    console.error("admin cash-payment error", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
