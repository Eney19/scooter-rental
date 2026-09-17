import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWeeklyPrice, calculateDebtSince, calculateAutoDebt, daysSinceDebt, DEBT_GRACE_DAYS, DEBT_PENALTY_PER_DAY } from "@/lib/pricing";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://powerdrive.in.ua";

// Кнопка одразу під повідомленням про борг. Веде на ту саму сторінку
// оплати, що й /pay — але сума на ній має точно збігатися з тим, що
// написано в тексті: /api/monopay/create бере суму з couriers.debt_amount
// (те саме число, яке ми щойно записали нижче), а не рахує її наново.
async function sendMessageWithPayButton(chatId: number | string, text: string, buttonText: string, courierId: string) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: buttonText, url: `${APP_URL}/payment/${courierId}` }]],
      },
    }),
  });
}

// Щодня: якщо кур'єр не оплатив підписку і не здав скутер, і адмін не
// позначив це вручну — одразу ж (без пільгового періоду) автоматично
// виставляємо статус "Боржник", фіксуємо дату (calculateDebtSince) і рахуємо
// суму боргу (тариф + DEBT_PENALTY_PER_DAY грн пені за кожен день з моменту,
// як став боржником).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const graceThreshold = new Date();
    graceThreshold.setDate(graceThreshold.getDate() - DEBT_GRACE_DAYS);

    const { data: overdueSubs, error } = await supabaseAdmin
      .from("subscriptions")
      .select(`
        id, expires_at, courier_id,
        courier:couriers(id, full_name, city, weekly_price, status, debt_since, debt_auto, telegram_chat_id)
      `)
      .eq("status", "active")
      .lt("expires_at", graceThreshold.toISOString());

    if (error) {
      console.error("Cron debtor-check error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let flagged = 0;
    let updated = 0;

    for (const sub of overdueSubs || []) {
      const courier = sub.courier as unknown as {
        id: string;
        full_name: string;
        city: string | null;
        weekly_price: number | null;
        status: string | null;
        debt_since: string | null;
        debt_auto: boolean | null;
        telegram_chat_id: number | null;
      } | null;
      if (!courier) continue;

      // Адмін уже вручну позначив цього кур'єра боржником (без авто-трекінгу) — не чіпаємо.
      if (courier.status === "debtor" && !courier.debt_auto) continue;

      const wasAlreadyDebtor = courier.status === "debtor";
      const debtSince = courier.debt_since || calculateDebtSince(sub.expires_at).toISOString();
      const baseAmount = getWeeklyPrice(courier);
      const debtAmount = calculateAutoDebt(baseAmount, debtSince);
      const penalty = debtAmount - baseAmount;

      await supabaseAdmin
        .from("couriers")
        .update({
          status: "debtor",
          debt_since: debtSince,
          debt_amount: debtAmount,
          debt_auto: true,
        })
        .eq("id", courier.id);

      if (wasAlreadyDebtor) updated++; else flagged++;

      if (courier.telegram_chat_id) {
        const overdueDays = daysSinceDebt(debtSince);
        const dayWord = overdueDays === 1 ? "день" : overdueDays >= 2 && overdueDays <= 4 ? "дні" : "днів";
        await sendMessageWithPayButton(
          courier.telegram_chat_id,
          `🔴 <b>Заборгованість</b>\n\n` +
          `Підписку прострочено, і скутер не повернуто. Ваш статус змінено на "Боржник".\n\n` +
          `Оренда за наступні 7 днів: <b>${baseAmount} грн</b>\n` +
          `Пеня (${overdueDays} ${dayWord} × ${DEBT_PENALTY_PER_DAY} грн): <b>${penalty} грн</b>\n` +
          `Разом до сплати: <b>${debtAmount} грн</b>\n\n` +
          `Пеня нараховується щодня, доки борг не погашено. Оплатіть онлайн у боті, зверніться до адміністратора або здайте скутер, щоб зупинити нарахування.`,
          `💳 Оплатити ${debtAmount} грн`,
          courier.id
        );
      }
    }

    console.log(`Cron debtor-check: flagged ${flagged}, updated ${updated}`);
    return NextResponse.json({ ok: true, flagged, updated });
  } catch (error) {
    console.error("Cron debtor-check error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
