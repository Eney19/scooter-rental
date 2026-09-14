import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Надсилання SMS-коду для входу в особистий кабінет. На відміну від
// реєстраційного /api/send-sms, тут courierId ще невідомий — його визначаємо
// пізніше, за номером телефону, у /api/cabinet/verify. Тому спершу перевіряємо,
// що кур'єр з таким номером взагалі існує в системі.
export async function POST(req: NextRequest) {
  try {
    const { phone: rawPhone } = await req.json();
    if (!rawPhone) {
      return NextResponse.json({ success: false, error: "Телефон обов'язковий" }, { status: 400 });
    }
    const phone = (rawPhone.startsWith("+") ? rawPhone : "+" + rawPhone).trim();

    const { data: courier, error: lookupError } = await supabaseAdmin
      .from("couriers")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();

    if (lookupError) {
      console.error("cabinet/login lookup error:", lookupError);
      return NextResponse.json({ success: false, error: "Помилка з'єднання з базою. Спробуйте ще раз." }, { status: 500 });
    }

    if (!courier) {
      return NextResponse.json({
        success: false,
        error: "Кур'єра з таким номером не знайдено. Спочатку зареєструйтесь.",
      });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await supabaseAdmin.from("signing_logs").insert({
      phone,
      sms_code: code,
      expires_at: expiresAt,
      used: false,
    });

    const token = process.env.TURBOSMS_TOKEN;
    const sender = process.env.TURBOSMS_SENDER || "MSG-UA";

    await fetch("https://api.turbosms.ua/message/send.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        recipients: [phone],
        sms: {
          sender,
          text: `Код входу в особистий кабінет PowerDrive: ${code}. Дійсний 5 хвилин.`,
        },
      }),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("cabinet/login error:", error);
    return NextResponse.json({ success: false, error: "Помилка надсилання SMS" }, { status: 500 });
  }
}
