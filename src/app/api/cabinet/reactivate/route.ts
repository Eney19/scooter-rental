import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCourierIdFromCookies } from "@/lib/cabinet-session";

// Кур'єр (статус "inactive", здав скутер) хоче взяти скутер знову.
// Тут лише фіксуємо обране місто/ціну/модель на його картці — так само, як
// це робить реєстрація. Сам курʼєр залишається "inactive", а /pay-інвойс
// (створюється клієнтом одразу після цього виклику через /api/monopay/create)
// активує його автоматично, щойно пройде оплата — той самий шлях, що і для
// першої оплати після реєстрації.
export async function POST(req: NextRequest) {
  const courierId = await getCourierIdFromCookies();
  if (!courierId) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const { city, weeklyPrice, scooterModel, batteryTypes } = await req.json();
    if (!city || !weeklyPrice || !scooterModel) {
      return NextResponse.json({ success: false, error: "Заповніть усі поля" }, { status: 400 });
    }
    const batteries: string[] = Array.isArray(batteryTypes) ? batteryTypes : [];
    const price = Number(weeklyPrice);
    if (!Number.isFinite(price) || price < 1000 || price > 10000) {
      return NextResponse.json({ success: false, error: "Некоректна ціна" }, { status: 400 });
    }

    const { data: courier, error: lookupError } = await supabaseAdmin
      .from("couriers")
      .select("id, status, debt_amount")
      .eq("id", courierId)
      .maybeSingle();

    if (lookupError) {
      console.error("cabinet/reactivate lookup error:", lookupError);
      return NextResponse.json({ success: false, error: "Помилка з'єднання з базою. Спробуйте ще раз." }, { status: 500 });
    }
    if (!courier) {
      return NextResponse.json({ success: false, error: "Кур'єра не знайдено" }, { status: 404 });
    }
    if (courier.status !== "inactive") {
      return NextResponse.json({ success: false, error: "Скутер вже активний" }, { status: 400 });
    }
    if (courier.debt_amount && courier.debt_amount > 0) {
      return NextResponse.json({
        success: false,
        error: "У вас є заборгованість. Зверніться до адміністратора, щоб продовжити.",
      }, { status: 400 });
    }

    await supabaseAdmin
      .from("couriers")
      .update({ city, weekly_price: price, scooter_model: scooterModel, battery_types: batteries })
      .eq("id", courierId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("cabinet/reactivate error:", error);
    return NextResponse.json({ success: false, error: "Внутрішня помилка" }, { status: 500 });
  }
}
