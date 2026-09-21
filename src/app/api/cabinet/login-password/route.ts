import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createSessionToken, CABINET_COOKIE_NAME, CABINET_COOKIE_MAX_AGE_SECONDS } from "@/lib/cabinet-session";
import { verifyPassword } from "@/lib/password";
import { normalizePhone } from "@/lib/phone";

// Вхід за паролем: ідентифікатор — номер телефону або email.
export async function POST(req: NextRequest) {
  try {
    const { identifier: rawIdentifier, password } = await req.json();
    if (!rawIdentifier || !password) {
      return NextResponse.json({ success: false, error: "Заповніть логін і пароль" }, { status: 400 });
    }
    const identifier = String(rawIdentifier).trim();
    const isEmail = identifier.includes("@");
    const phone = !isEmail ? normalizePhone(identifier) : null;

    const query = supabaseAdmin
      .from("couriers")
      .select("id, full_name, password_hash");

    const { data: courier, error } = isEmail
      ? await query.eq("email", identifier).maybeSingle()
      : await query.eq("phone", phone as string).maybeSingle();

    if (error) {
      console.error("cabinet/login-password lookup error:", error);
      return NextResponse.json({ success: false, error: "Помилка з'єднання з базою. Спробуйте ще раз." }, { status: 500 });
    }

    // Однакове повідомлення для "не знайдено" й "невірний пароль" — щоб не
    // підказувати зловмиснику, які номери/пошти взагалі зареєстровані.
    const genericError = "Невірний логін або пароль";

    if (!courier) {
      return NextResponse.json({ success: false, error: genericError });
    }
    if (!courier.password_hash) {
      return NextResponse.json({
        success: false,
        error: "Пароль ще не встановлено. Увійдіть через SMS, щоб його створити.",
        needsPasswordSetup: true,
      });
    }
    if (!verifyPassword(String(password), courier.password_hash)) {
      return NextResponse.json({ success: false, error: genericError });
    }

    await supabaseAdmin
      .from("couriers")
      .update({ last_cabinet_login_at: new Date().toISOString() })
      .eq("id", courier.id);

    const res = NextResponse.json({ success: true, courierName: courier.full_name });
    res.cookies.set(CABINET_COOKIE_NAME, createSessionToken(courier.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: CABINET_COOKIE_MAX_AGE_SECONDS,
    });
    return res;
  } catch (error) {
    console.error("cabinet/login-password error:", error);
    return NextResponse.json({ success: false, error: "Внутрішня помилка" }, { status: 500 });
  }
}
