import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { collectSheetDebtors, CityConfig } from "@/lib/debtors-report";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const SHEET_CITIES: CityConfig[] = [
  { city: "Луцьк", spreadsheetId: process.env.GOOGLE_SHEET_ID_LUTSK! },
  { city: "Рівне", spreadsheetId: process.env.GOOGLE_SHEET_ID_RIVNE! },
  { city: "Львів", spreadsheetId: process.env.GOOGLE_SHEET_ID_LVIV! },
];

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

    const debtorList = (debtors || []).filter((courier) => {
      const subs = (courier.subscriptions as any[]) || [];
      const activeSub = subs.find(
        (s) => s.status === "active" && new Date(s.expires_at) > now
      );
      return !activeSub;
    });

    const paidList = (debtors || []).filter((courier) => {
      const subs = (courier.subscriptions as any[]) || [];
      return subs.some(
        (s) => s.status === "active" && new Date(s.expires_at) > now
      );
    });

    let sheetDebtors: Awaited<ReturnType<typeof collectSheetDebtors>> = [];
    try {
      sheetDebtors = await collectSheetDebtors(SHEET_CITIES);
    } catch (sheetsErr) {
      console.error("Sheets debtors fetch failed:", sheetsErr);
    }

    const today = now.toLocaleDateString("uk-UA");

    let reportText = `📊 <b>Щоденний звіт PowerDrive</b>\n`;
    reportText += `📅 ${today}\n\n`;

    if (debtorList.length > 0) {
      reportText += `🔴 <b>Боржники із застосунку (${debtorList.length}):</b>\n`;
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
      reportText += `🟢 <b>Боржників із застосунку немає</b>\n`;
    }

    reportText += `\n`;

    if (sheetDebtors.length > 0) {
      const sheetTotal = sheetDebtors.reduce((sum, d) => sum + d.debt, 0);
      reportText += `🗂 <b>Боржники з таблиць (${sheetDebtors.length}, ${sheetTotal.toLocaleString("uk-UA")} грн):</b>\n`;
      for (const d of sheetDebtors) {
        const phone = d.phone ? ` 📞 ${d.phone}` : "";
        reportText += `• <b>${d.name}</b> (${d.city})${phone} — ${d.debt.toLocaleString("uk-UA")} грн\n`;
      }
    } else {
      reportText += `🟢 <b>Боржників з таблиць немає</b>\n`;
    }

    reportText += `\n`;

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

    console.log(
      `Daily report sent: ${debtorList.length} app debtors, ${sheetDebtors.length} sheet debtors, ${paidList.length} paid`
    );
    return NextResponse.json({
      ok: true,
      appDebtors: debtorList.length,
      sheetDebtors: sheetDebtors.length,
      paid: paidList.length,
    });
  } catch (error) {
    console.error("Daily report error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}