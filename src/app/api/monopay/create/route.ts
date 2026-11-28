import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWeeklyPrice, daysOverdue, resolveDeposit, getBatteryWeeklyPrice, getBatteryLabels, batteryAmountForLedger, PENALTY_PAYMENT_TYPE } from "@/lib/pricing";
import { loadCourierDebtLedger } from "@/lib/debt";
import { shouldChargeDeposit } from "@/lib/rental-history";

const MONOBANK_TOKEN = process.env.MONOBANK_TOKEN!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://powerdrive.in.ua";

export async function POST(req: NextRequest) {
  try {
    const { courierId } = await req.json();

    // Отримуємо дані курʼєра
    const { data: courier, error } = await supabaseAdmin
    .from("couriers")
    .select("full_name, phone, email, city, weekly_price, rental_type, battery_types, status, debt_amount, debt_auto, no_penalty, telegram_chat_id, subscription_start_date, deposit_amount")
    .eq("id", courierId)
    .single();

  if (error || !courier) {
    return NextResponse.json({ success: false, error: "Кур'єра не знайдено" }, { status: 404 });
  }

  // Оплата онлайн доступна лише після підключення Telegram-бота: уся
  // комунікація (чек, історія оплат, нагадування) відбувається в боті.
  if (!courier.telegram_chat_id) {
    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "powerdrive_scooter_bot";
    return NextResponse.json({
      success: false,
      needTelegram: true,
      botUrl: `https://t.me/${botUsername}?start=${courierId}`,
      error: "Спочатку підключіть Telegram-бота (натисніть /start) — оплата доступна через нього.",
    }, { status: 403 });
  }

  const baseAmount = getWeeklyPrice(courier);
  const batteryWeeklyPrice = getBatteryWeeklyPrice(courier.battery_types);
  const batteryLabels = getBatteryLabels(courier.battery_types);

  const { data: overdueSub } = await supabaseAdmin
    .from("subscriptions")
    .select("expires_at")
    .eq("courier_id", courierId)
    .eq("status", "active")
    .order("expires_at", { ascending: false })
    .limit(1)
    .single();

  const late = overdueSub ? daysOverdue(overdueSub.expires_at) : 0;
  // Якщо адмін вручну зафіксував суму боргу (debt_auto=false) — довіряємо їй.
  // Інакше, якщо прострочено — рахуємо наживо з повної історії платежів
  // (Нараховано − Оплачено + Пеня), а не лише з поточного тижня; якщо ще
  // не прострочено — звичайний тижневий тариф, як і раніше.
  // Пеня — окремим платежем (type "penalty", окремий рядок з reference
  // "<reference>_penalty"), щоб вона не перетворювалась на "оплачені" дні
  // оренди. Сума інвойсу для курʼєра не змінюється (оренда + пеня + завдаток).
  const manualDebt = courier.status === "debtor" && courier.debt_auto === false && typeof courier.debt_amount === "number";
  const debtLedger = !manualDebt && late > 0
    ? await loadCourierDebtLedger(courierId, baseAmount, courier.subscription_start_date, null, !!courier.no_penalty, resolveDeposit(courier, true))
    : null;
  const rentAmount = manualDebt
    ? (courier.debt_amount as number)
    : debtLedger
      ? debtLedger.remainingDebt
      : baseAmount;
  const penaltyAmount = debtLedger ? debtLedger.penalty : 0;

  // Завдаток стягується на кожне нове взяття скутера (коли в кур'єра зараз
  // немає відкритого періоду оренди), а не лише раз за все життя акаунта.
  const chargeDeposit = await shouldChargeDeposit(courierId);
  const deposit = resolveDeposit(courier, chargeDeposit);

  const amountUAH = rentAmount + penaltyAmount + deposit;
  // Курʼєр "лише акумулятор" не орендує скутер узагалі — не підписуємо
  // йому в банківському інвойсі вигадану "оренду скутера".
  const rentLabel = courier.rental_type === "battery_only" ? "Оренда акумулятора" : "Оренда скутера";
    const amountKopecks = amountUAH * 100; // Monobank приймає суму в копійках

    const reference = `powerdrive_${courierId}_${Date.now()}`;

    // Зберігаємо платіж зі статусом pending
    await supabaseAdmin.from("payments").insert({
      courier_id: courierId,
      amount: rentAmount + deposit,
      deposit,
      battery_amount: batteryAmountForLedger(courier.rental_type, batteryWeeklyPrice),
      type: "weekly_rent",
      status: "pending",
      wayforpay_id: reference, // використовуємо це поле для reference
    });
    if (penaltyAmount > 0) {
      await supabaseAdmin.from("payments").insert({
        courier_id: courierId,
        amount: penaltyAmount,
        deposit: 0,
        battery_amount: 0,
        type: PENALTY_PAYMENT_TYPE,
        status: "pending",
        wayforpay_id: `${reference}_penalty`,
      });
    }

    // Створюємо інвойс через Monobank API
    const response = await fetch("https://api.monobank.ua/api/merchant/invoice/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Token": MONOBANK_TOKEN,
      },
      body: JSON.stringify({
        amount: amountKopecks,
        ccy: 980, // UAH
        merchantPaymInfo: {
          reference,
          destination: (
            deposit > 0
              ? `${rentLabel} ${rentAmount} грн${penaltyAmount > 0 ? ` + пеня ${penaltyAmount} грн` : ""} + завдаток ${deposit} грн — ${courier.full_name} (${courier.city || ""})`
              : `${rentLabel} — ${courier.full_name} (${courier.city || ""})`
          ).trim(),
        },
        redirectUrl: `${APP_URL}/payment/success`,
        webHookUrl: `${APP_URL}/api/monopay/webhook`,
      }),
    });

    const data = await response.json();
    console.log("Monobank create invoice response:", data);

    if (!response.ok || !data.pageUrl) {
      console.error("Monobank invoice creation failed:", data);
      return NextResponse.json({ success: false, error: "Помилка створення платежу" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      pageUrl: data.pageUrl,
      invoiceId: data.invoiceId,
      amount: amountUAH,
      rentAmount,
      deposit,
      batteryWeeklyPrice,
      batteryLabels,
    });
  } catch (error) {
    console.error("Monobank create error:", error);
    return NextResponse.json({ success: false, error: "Помилка створення платежу" }, { status: 500 });
  }
}
