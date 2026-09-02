import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWeeklyPrice, daysOverdue, totalWithPenalty } from "@/lib/pricing";

export async function POST(req: NextRequest) {
  try {
    const { courierId } = await req.json();

    if (!courierId) {
      return NextResponse.json({ success: false, error: "courierId is required" }, { status: 400 });
    }

    const { data: courier } = await supabaseAdmin
      .from("couriers")
      .select("full_name, phone, city, weekly_price")
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
    const amount = totalWithPenalty(getWeeklyPrice(courier), late);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const now = new Date().toISOString();

    await supabaseAdmin.from("payments").insert({
      courier_id: courierId,
      amount,
      type: "weekly_rent",
      status: "success",
      wayforpay_id: `cash_${Date.now()}`,
    });

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

    await supabaseAdmin
      .from("couriers")
      .update({ status: "active" })
      .eq("id", courierId);

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
                `Ваш готівковий платіж <b>${amount} грн</b> прийнято.\n\n` +
                `Підписка активна до <b>${nextDate}</b>.\n\n` +
                `Дякуємо! 🛵`,
            }),
          });
        } catch (e) {
          console.error("Telegram notify error", e);
        }
      }
    }

    return NextResponse.json({ success: true, amount, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error("admin cash-payment error", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
