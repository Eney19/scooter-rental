import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { phone: rawPhone, code, courierId } = await req.json();
    const phone = (rawPhone.startsWith("+") ? rawPhone : "+" + rawPhone).trim();
    const trimmedCode = code?.trim();

    console.log("verify-sms phone:", phone, "code:", code);

    // Шукаємо невикористаний код для цього телефону (без сортування — воно
    // раніше посилалось на неіснуючу в таблиці колонку й через це запит завжди
    // падав з помилкою, тож ЖОДЕН код ніколи не проходив перевірку).
    const { data, error } = await supabaseAdmin
      .from("signing_logs")
      .select("*")
      .eq("phone", phone)
      .eq("sms_code", trimmedCode)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("verify-sms query error:", error);
      return NextResponse.json({ success: false, error: "Помилка перевірки коду" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ success: false, error: "Невірний або застарілий код" });
    }

    // Помічаємо код як використаний
    await supabaseAdmin
      .from("signing_logs")
      .update({ used: true, courier_id: courierId })
      .eq("id", data.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("verify-sms error:", error);
    return NextResponse.json({ success: false, error: "Помилка перевірки коду" }, { status: 500 });
  }
}
