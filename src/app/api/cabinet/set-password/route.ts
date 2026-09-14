import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCourierIdFromCookies } from "@/lib/cabinet-session";
import { hashPassword } from "@/lib/password";

// Встановлення/зміна паролю для входу в кабінет. Вимагає активної сесії —
// або щойно виданої після SMS-підтвердження (перший раз), або вже наявної
// (кур'єр міняє пароль сам, будучи залогіненим).
export async function POST(req: NextRequest) {
  const courierId = await getCourierIdFromCookies();
  if (!courierId) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const { password } = await req.json();
    if (!password || String(password).length < 6) {
      return NextResponse.json({ success: false, error: "Пароль має містити щонайменше 6 символів" }, { status: 400 });
    }

    const passwordHash = hashPassword(String(password));
    const { error } = await supabaseAdmin
      .from("couriers")
      .update({ password_hash: passwordHash })
      .eq("id", courierId);

    if (error) {
      console.error("cabinet/set-password error:", error);
      return NextResponse.json({ success: false, error: "Не вдалося зберегти пароль" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("cabinet/set-password error:", error);
    return NextResponse.json({ success: false, error: "Внутрішня помилка" }, { status: 500 });
  }
}
