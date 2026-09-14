import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCourierIdFromCookies } from "@/lib/cabinet-session";

// Активний кур'єр хоче оплатити наперед ще на тиждень, але спершу може
// змінити тариф/модель скутера/акумулятор (наприклад, домовився з адміном
// про іншу ціну або взяв інший скутер). Просто оновлюємо картку — сама
// оплата (онлайн через /api/monopay/create або готівкою через
// /api/cash-payment-request) створюється клієнтом одразу після цього виклику
// і читає вже оновлені поля.
export async function POST(req: NextRequest) {
  const courierId = await getCourierIdFromCookies();
  if (!courierId) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const { weeklyPrice, scooterModel, batteryTypes } = await req.json();
    if (!weeklyPrice || !scooterModel) {
      return NextResponse.json({ success: false, error: "Заповніть усі поля" }, { status: 400 });
    }
    const price = Number(weeklyPrice);
    if (!Number.isFinite(price) || price < 1000 || price > 10000) {
      return NextResponse.json({ success: false, error: "Некоректна ціна" }, { status: 400 });
    }
    const batteries: string[] = Array.isArray(batteryTypes) ? batteryTypes : [];

    const { data: courier, error: lookupError } = await supabaseAdmin
      .from("couriers")
      .select("id, status")
      .eq("id", courierId)
      .maybeSingle();

    if (lookupError) {
      console.error("cabinet/update-plan lookup error:", lookupError);
      return NextResponse.json({ success: false, error: "Помилка з'єднання з базою. Спробуйте ще раз." }, { status: 500 });
    }
    if (!courier) {
      return NextResponse.json({ success: false, error: "Кур'єра не знайдено" }, { status: 404 });
    }
    if (courier.status !== "active") {
      return NextResponse.json({ success: false, error: "Ця дія доступна лише для активної підписки" }, { status: 400 });
    }

    const { error: updErr } = await supabaseAdmin
      .from("couriers")
      .update({ weekly_price: price, scooter_model: scooterModel, battery_types: batteries })
      .eq("id", courierId);

    if (updErr) {
      console.error("cabinet/update-plan update error:", updErr);
      return NextResponse.json({ success: false, error: "Помилка з'єднання з базою. Спробуйте ще раз." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("cabinet/update-plan error:", error);
    return NextResponse.json({ success: false, error: "Внутрішня помилка" }, { status: 500 });
  }
}
