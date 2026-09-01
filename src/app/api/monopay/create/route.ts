import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWeeklyPrice, daysOverdue, totalWithPenalty } from "@/lib/pricing";

const MONOBANK_TOKEN = process.env.MONOBANK_TOKEN!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://powerdrive.in.ua";

export async function POST(req: NextRequest) {
  try {
    const { courierId } = await req.json();

    // Отримуємо дані курʼєра
    const { data: courier, error } = await supabaseAdmin
    .from("couriers")
    .select("full_name, phone, email, city, weekly_price")
    .eq("id", courierId)
    .single();

  if (error || !courier) {
    return NextResponse.json({ success: false, error: "Кур'єра не знайдено" }, { status: 404 });
  }

  const baseAmount = getWeeklyPrice(courier);

  const { data: overdueSub } = await supabaseAdmin
    .from("subscriptions")
    .select("expires_at")
    .eq("courier_id", courierId)
    .eq("status", "active")
    .order("expires_at", { ascending: false })
    .limit(1)
    .single();

  const late = overdueSub ? daysOverdue(overdueSub.expires_at) : 0;
  const amountUAH = totalWithPenalty(baseAmount, late);
    const amountKopecks = amountUAH * 100; // Monobank приймає суму в копійках

    const reference = `powerdrive_${courierId}_${Date.now()}`;

    // Зберігаємо платіж зі статусом pending
    await supabaseAdmin.from("payments").insert({
      courier_id: courierId,
      amount: amountUAH,
      type: "weekly_rent",
      status: "pending",
      wayforpay_id: reference, // використовуємо це поле для reference
    });

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
          destination: `Оренда скутера — ${courier.full_name} (${courier.city || ""})`.trim(),
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
    });
  } catch (error) {
    console.error("Monobank create error:", error);
    return NextResponse.json({ success: false, error: "Помилка створення платежу" }, { status: 500 });
  }
}
