import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { phone: rawPhone } = await req.json();
    const phone = rawPhone.startsWith("+") ? rawPhone : "+" + rawPhone;

    if (!phone) return NextResponse.json({ success: false, error: "Телефон обов'язковий" });

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
    console.log("🔵 TURBOSMS_SENDER from .env:", process.env.TURBOSMS_SENDER);
    console.log("🔵 Using sender:", sender);

    const response = await fetch("https://api.turbosms.ua/message/send.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        recipients: [phone],
        sms: {
          sender,
          text: `Ваш код підтвердження: ${code}. Дійсний 5 хвилин.`,
        },
      }),
    });

    const result = await response.json();
    console.log("TurboSMS response:", result);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("send-sms error:", error);
    return NextResponse.json({ success: false, error: "Помилка надсилання SMS" }, { status: 500 });
  }
}   