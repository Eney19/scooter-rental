import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWeeklyPrice, daysOverdue, totalWithPenalty, getDepositAmount, getBatteryWeeklyPrice } from "@/lib/pricing";
import { isFirstPayment } from "@/lib/subscription";

// Рахує, скільки готівки очікувати від кур'єра (оренда + завдаток, якщо
// перша оплата) — та сама логіка, що і в admin/cash-payment, але без
// побічних ефектів. Використовується адмінкою, щоб показати суму заздалегідь
// і дозволити відредагувати перед підтвердженням.
export async function POST(req: NextRequest) {
  try {
    const { courierId } = await req.json();

    if (!courierId) {
      return NextResponse.json({ success: false, error: "courierId is required" }, { status: 400 });
    }

    const { data: courier } = await supabaseAdmin
      .from("couriers")
      .select("city, weekly_price, battery_types")
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
    const rentAmount = totalWithPenalty(getWeeklyPrice(courier), late);
    const firstPayment = await isFirstPayment(courierId);
    const deposit = firstPayment ? getDepositAmount(courier.city) : 0;
    const batteryAmount = getBatteryWeeklyPrice(courier.battery_types);
    const scooterAmount = rentAmount - batteryAmount;

    return NextResponse.json({
      success: true,
      rentAmount,
      batteryAmount,
      scooterAmount,
      deposit,
      amount: rentAmount + deposit,
      firstPayment,
    });
  } catch (error) {
    console.error("admin cash-payment-preview error", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
