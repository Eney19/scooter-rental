import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId: string, text: string) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    // Активні курʼєри з простроченою або відсутньою підпискою
    const { data: debtors, error } = await supabaseAdmin
      .from("couriers")
      .select(`
        id, full_name, phone, city, telegram_chat_id,
        subscriptions(status, expires_at, amount)
      `)
      .eq("status", "active");

    if (error) {
      console.error("Daily report error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Активні курʼєри у яких підписка прострочена або відсутня
    const debtorList = (debtors || []).filter((courier) => {
      const subs = (courier.subscriptions as any[]) || [];
      const activeSub = subs.find(
        (s) => s.status === "active" && new Date(s.expires_at) > now
      );
      return !activeSub; // боржник = немає активної підписки
    });

    // Курʼєри з активною підпискою
    const paidList = (debtors || []).filter((courier) => {
      const subs = (courier.subscriptions as any[]) || [];
      return subs.some(
        (s) => s.status === "active" && new Date(s.expires_at) > now
      );
    });

    const today = now.toLocaleDateString("uk-UA");

    let reportText = `📊 <b>Щоденний звіт PowerDrive</b>\n`;
    reportText += `📅 ${today}\n\n`;

    // Боржники
    if (debtorList.length > 0) {
      reportText += `🔴 <b>Боржники (${debtorList.length}):</b>\n`;
      for (const courier of debtorList) {
        const subs = (courier.subscriptions as any[]) || [];
        const lastSub = subs.sort(
          (a: any, b: any) =>
            new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime()
        )[0];

        const expiredDate = lastSub
          ? `прострочена з ${new Date(lastSub.expires_at).toLocaleDateString("uk-UA")}`
          : "підписки немає";

        reportText += `• <b>${courier.full_name}</b> (${courier.city || "—"})\n`;
        reportText += `  📞 ${courier.phone} — ${expiredDate}\n`;
      }
    } else {
      reportText += `🟢 <b>Боржників немає</b>\n`;
    }

    reportText += `\n`;

    // Оплатили
    if (paidList.length > 0) {
      reportText += `✅ <b>Активні підписки (${paidList.length}):</b>\n`;
      for (const courier of paidList) {
        const subs = (courier.subscriptions as any[]) || [];
        const activeSub = subs.find(
          (s: any) => s.status === "active" && new Date(s.expires_at) > now
        );
        const expiresDate = activeSub
          ? new Date(activeSub.expires_at).toLocaleDateString("uk-UA")
          : "—";

        reportText += `• <b>${courier.full_name}</b> (${courier.city || "—"}) — до ${expiresDate}\n`;
      }
    }

    reportText += `\n💰 <b>Всього активних:</b> ${paidList.length} з ${(debtors || []).length}`;

    await sendMessage(ADMIN_CHAT_ID, reportText);

    console.log(`Daily report sent: ${debtorList.length} debtors, ${paidList.length} paid`);
    return NextResponse.json({
      ok: true,
      debtors: debtorList.length,
      paid: paidList.length,
    });
  } catch (error) {
    console.error("Daily report error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}