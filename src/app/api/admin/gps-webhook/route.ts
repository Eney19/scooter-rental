// Приймає webhook "sms:received" від SMS Gateway for Android (Cloud) —
// коли трекер відповідає SMS (напр. "SET OK") на наш телефон-шлюз, тут
// записується останнє підтвердження для відповідного скутера (за
// gps_sim_phone), щоб показати в адмінці, що команда реально дійшла.
//
// Реєстрація вебхука (одноразово, з реального терміналу — не з цього
// середовища, бо SMS Gateway Cloud недоступний з мережі цієї сесії):
//   curl -X POST https://api.sms-gate.app/3rdparty/v1/webhooks \
//     -u "<SMS_GATEWAY_LOGIN>:<SMS_GATEWAY_PASSWORD>" \
//     -H "Content-Type: application/json" \
//     -d '{"url":"https://powerdrive-beige.vercel.app/api/admin/gps-webhook?key=<GPS_WEBHOOK_SECRET>","event":"sms:received"}'

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  // Приводимо до останніх 9 цифр (без коду країни/нулів-префіксів), щоб
  // порівнювати номери незалежно від того, як саме їх записано (+380XXXXXXXXX,
  // 0XXXXXXXXX, 380XXXXXXXXX тощо).
  return digits.slice(-9);
}

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.GPS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (body?.event !== "sms:received") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const sender: string | undefined = body?.payload?.sender;
    const message: string | undefined = body?.payload?.message;
    const receivedAt: string | undefined = body?.payload?.receivedAt;
    if (!sender || !message) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const { data: scooters } = await supabaseAdmin
      .from("scooters")
      .select("id, gps_sim_phone")
      .not("gps_sim_phone", "is", null);

    const senderNorm = normalizePhone(sender);
    const match = (scooters || []).find(
      (s) => s.gps_sim_phone && normalizePhone(s.gps_sim_phone) === senderNorm
    );

    if (match) {
      await supabaseAdmin
        .from("scooters")
        .update({
          gps_last_ack_at: receivedAt || new Date().toISOString(),
          gps_last_ack_text: message,
        })
        .eq("id", match.id);
    }

    return NextResponse.json({ ok: true, matched: !!match });
  } catch (error) {
    console.error("gps-webhook error", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
