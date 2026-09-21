import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createSessionToken, CABINET_COOKIE_NAME, CABINET_COOKIE_MAX_AGE_SECONDS } from "@/lib/cabinet-session";
import { normalizePhone } from "@/lib/phone";

export async function POST(req: NextRequest) {
  try {
    const { phone: rawPhone, code } = await req.json();
    if (!rawPhone || !code) {
      return NextResponse.json({ success: false, error: "Відсутні дані" }, { status: 400 });
    }
    const phone = normalizePhone(rawPhone);
    const trimmedCode = String(code).trim();

    const { data: courier, error: lookupError } = await supabaseAdmin
      .from("couriers")
      .select("id, full_name, password_hash")
      .eq("phone", phone)
      .maybeSingle();

    if (lookupError) {
      console.error("cabinet/verify lookup error:", lookupError);
      return NextResponse.json({ success: false, error: "Помилка з'єднання з базою. Спробуйте ще раз." }, { status: 500 });
    }
    if (!courier) {
      return NextResponse.json({ success: false, error: "Кур'єра з таким номером не знайдено" });
    }

    const { data: log, error } = await supabaseAdmin
      .from("signing_logs")
      .select("*")
      .eq("phone", phone)
      .eq("sms_code", trimmedCode)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("cabinet/verify query error:", error);
      return NextResponse.json({ success: false, error: "Помилка перевірки коду" }, { status: 500 });
    }
    if (!log) {
      return NextResponse.json({ success: false, error: "Невірний або застарілий код" });
    }

    await supabaseAdmin
      .from("signing_logs")
      .update({ used: true, courier_id: courier.id })
      .eq("id", log.id);

    await supabaseAdmin
      .from("couriers")
      .update({ last_cabinet_login_at: new Date().toISOString() })
      .eq("id", courier.id);

    const res = NextResponse.json({
      success: true,
      courierName: courier.full_name,
      hasPassword: !!courier.password_hash,
    });
    res.cookies.set(CABINET_COOKIE_NAME, createSessionToken(courier.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: CABINET_COOKIE_MAX_AGE_SECONDS,
    });
    return res;
  } catch (error) {
    console.error("cabinet/verify error:", error);
    return NextResponse.json({ success: false, error: "Помилка перевірки коду" }, { status: 500 });
  }
}
