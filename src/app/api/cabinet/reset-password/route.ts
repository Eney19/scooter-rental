import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { hashPassword, hashResetToken } from "@/lib/password";

export async function POST(req: NextRequest) {
  try {
    const { courierId, token, newPassword } = await req.json();
    if (!courierId || !token || !newPassword) {
      return NextResponse.json({ success: false, error: "Відсутні дані" }, { status: 400 });
    }
    if (String(newPassword).length < 6) {
      return NextResponse.json({ success: false, error: "Пароль має містити щонайменше 6 символів" }, { status: 400 });
    }

    const { data: courier, error } = await supabaseAdmin
      .from("couriers")
      .select("id, reset_token_hash, reset_token_expires_at")
      .eq("id", courierId)
      .maybeSingle();

    if (error) {
      console.error("cabinet/reset-password lookup error:", error);
      return NextResponse.json({ success: false, error: "Помилка з'єднання з базою. Спробуйте ще раз." }, { status: 500 });
    }

    const tokenHash = hashResetToken(String(token));
    const valid =
      courier &&
      courier.reset_token_hash === tokenHash &&
      courier.reset_token_expires_at &&
      new Date(courier.reset_token_expires_at).getTime() > Date.now();

    if (!valid) {
      return NextResponse.json({ success: false, error: "Посилання недійсне або застаріле. Запросіть скидання паролю ще раз." });
    }

    await supabaseAdmin
      .from("couriers")
      .update({
        password_hash: hashPassword(String(newPassword)),
        reset_token_hash: null,
        reset_token_expires_at: null,
      })
      .eq("id", courierId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("cabinet/reset-password error:", error);
    return NextResponse.json({ success: false, error: "Внутрішня помилка" }, { status: 500 });
  }
}
