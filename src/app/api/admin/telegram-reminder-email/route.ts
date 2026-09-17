import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase";

const resend = new Resend(process.env.RESEND_API_KEY);
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "powerdrive_scooter_bot";

// Розсилка курʼєрам, у яких є email, але немає telegram_chat_id — з
// посиланням-диплінком (t.me/<bot>?start=<courierId>), яке підключає бота
// одним натисканням, без ручного ділення номером телефону.
export async function POST() {
  try {
    const { data: couriers, error } = await supabaseAdmin
      .from("couriers")
      .select("id, full_name, email")
      .not("email", "is", null)
      .is("telegram_chat_id", null);

    if (error) {
      console.error("telegram-reminder-email query error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    let sent = 0;
    let failed = 0;

    for (const courier of couriers || []) {
      if (!courier.email) continue;
      const botLink = `https://t.me/${BOT_USERNAME}?start=${courier.id}`;
      try {
        await resend.emails.send({
          from: "PowerDrive <onboarding@resend.dev>",
          to: courier.email,
          subject: "Підключіть Telegram-бот PowerDrive",
          html:
            `<p>Вітаємо, ${courier.full_name}!</p>` +
            `<p>Підключіть наш Telegram-бот PowerDrive, щоб отримувати нагадування про оплату оренди, перевіряти статус підписки та швидко оплачувати онлайн.</p>` +
            `<p><a href="${botLink}">Натисніть тут, щоб підключитися</a></p>` +
            `<p>Це займає кілька секунд — просто натисніть кнопку "Start" у Telegram.</p>`,
        });
        sent++;
      } catch (e) {
        console.error("telegram-reminder-email: send failed for", courier.id, e);
        failed++;
      }
    }

    return NextResponse.json({ success: true, sent, failed, total: (couriers || []).length });
  } catch (error) {
    console.error("telegram-reminder-email error:", error);
    return NextResponse.json({ success: false, error: "Внутрішня помилка" }, { status: 500 });
  }
}
