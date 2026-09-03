import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWeeklyPrice, calculateDebtSince, calculateAutoDebt, DEBT_GRACE_DAYS, DEBT_PENALTY_PER_DAY } from "@/lib/pricing";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId: number | string, text: string) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

// Щодня: якщо кур'єр не оплатив підписку і не здав скутер протягом
// DEBT_GRACE_DAYS днів після її закінчення, і адмін не позначив це вручну —
// автоматично виставляємо статус "Боржник", фіксуємо дату (calculateDebtSince)
// і рахуємо суму боргу (тариф + 150 грн пені за кожен день з моменту, як став боржником).
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
        await sendMessage(
          courier.telegram_chat_id,
          `🔴 <b>Заборгованість</b>\n\n` +
          `Оплата не надходила понад ${DEBT_GRACE_DAYS} днів, і скутер не повернуто. Ваш статус змінено на "Боржник".\n\n` +
          `Борг без пені: <b>${baseAmount} грн</b>\n` +
          `Борг з пенею: <b>${debtAmount} грн</b> (${baseAmount} + ${penalty} пеня по ${DEBT_PENALTY_PER_DAY} грн/день)\n\n` +
          `Пеня нараховується щодня, доки борг не погашено. Оплатіть онлайн у боті або зверніться до адміністратора, щоб зупинити нарахування.`
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
