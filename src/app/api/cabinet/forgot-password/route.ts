import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateResetToken } from "@/lib/password";
import { sendEmailChecked } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://powerdrive.in.ua";
const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID;

export async function POST(req: NextRequest) {
  try {
    const { email: rawEmail } = await req.json();
    if (!rawEmail) {
      return NextResponse.json({ success: false, error: "Вкажіть email" }, { status: 400 });
    }
    const email = String(rawEmail).trim();

    const { data: courier } = await supabaseAdmin
      .from("couriers")
      .select("id, full_name")
      .eq("email", email)
      .maybeSingle();

    // Відповідаємо однаково незалежно від того, чи знайдено email — щоб не
    // підказувати, які адреси зареєстровані в системі.
    if (courier) {
      const { token, tokenHash } = generateResetToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 година

      const { error: updErr } = await supabaseAdmin
        .from("couriers")
        .update({ reset_token_hash: tokenHash, reset_token_expires_at: expiresAt })
        .eq("id", courier.id);

      if (updErr) {
        console.error("forgot-password update error:", updErr);
        return NextResponse.json(
          { success: false, error: "Помилка з'єднання з базою. Спробуйте ще раз." },
          { status: 500 }
        );
      }

      const resetUrl = `${APP_URL}/cabinet/reset-password?courierId=${courier.id}&token=${token}`;

      const { ok: emailOk, error: emailError } = await sendEmailChecked({
        from: "PowerDrive <onboarding@resend.dev>",
        to: email,
        subject: "Відновлення паролю — PowerDrive",
        html:
          `<p>Привіт, ${courier.full_name}!</p>` +
          `<p>Хтось (сподіваємось, ви) запросив скидання паролю до особистого кабінету PowerDrive.</p>` +
          `<p><a href="${resetUrl}">Встановити новий пароль</a></p>` +
          `<p>Посилання дійсне 1 годину. Якщо це були не ви — просто проігноруйте цей лист.</p>`,
      });

      if (!emailOk) {
        console.error("forgot-password: email send failed", { courierId: courier.id, email, emailError });
        if (ADMIN_CHAT_ID) {
          try {
            await sendTelegramMessage(
              Number(ADMIN_CHAT_ID),
              `⚠️ <b>Не вдалося надіслати лист для скидання паролю</b>\n\n` +
              `Кур'єр: ${courier.full_name}\n` +
              `Email: ${email}\n` +
              `Помилка: ${emailError}`
            );
          } catch (alertErr) {
            console.error("forgot-password: admin alert failed", alertErr);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("cabinet/forgot-password error:", error);
    return NextResponse.json({ success: false, error: "Внутрішня помилка" }, { status: 500 });
  }
}
