import { NextRequest, NextResponse } from "next/server";
import { createPublicKey, createVerify } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

let cachedPubKey: string | null = null;

async function getMonobankPubKey(): Promise<string> {
  if (cachedPubKey) return cachedPubKey;
  const res = await fetch("https://api.monobank.ua/api/merchant/pubkey", {
    headers: { "X-Token": process.env.MONOBANK_TOKEN! },
  });
  const data = await res.json();
  // key — це Base64-encoded PEM рядок, декодуємо його
  cachedPubKey = Buffer.from(data.key, "base64").toString("utf8");
  console.log("Monobank pubkey (PEM):", cachedPubKey?.substring(0, 50));
  return cachedPubKey!;
}

function verifySignature(body: string, xSign: string, pubKeyPem: string): boolean {
  try {
    const pubKey = createPublicKey({ key: pubKeyPem, format: "pem" });
    const signature = Buffer.from(xSign, "base64");
    const verify = createVerify("SHA256");
    verify.update(body);
    verify.end();
    return verify.verify(pubKey, signature);
  } catch (e) {
    console.error("Signature verification error:", e);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const xSign = req.headers.get("x-sign") || "";

    console.log("Monobank webhook received, x-sign:", xSign ? "present" : "missing");

    if (xSign) {
      const pubKey = await getMonobankPubKey();
      const isValid = verifySignature(rawBody, xSign, pubKey);
      if (!isValid) {
        console.error("Monobank webhook: invalid signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }
    }

    const body = JSON.parse(rawBody);
    const { invoiceId, status, amount, reference, failureReason } = body;

    console.log(`Monobank webhook: invoiceId=${invoiceId}, status=${status}`);

    if (status === "success") {
      const amountUAH = Math.round(amount / 100);
      const parts = (reference || "").split("_");
      const courierId = parts[1];

      if (!courierId) {
        console.error("Cannot extract courierId from reference:", reference);
        return NextResponse.json({ ok: true });
      }

      await supabaseAdmin
        .from("payments")
        .update({ status: "success", wayforpay_id: invoiceId })
        .eq("courier_id", courierId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const { data: existingSub } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("courier_id", courierId)
        .eq("status", "active")
        .single();

      if (existingSub) {
        await supabaseAdmin
          .from("subscriptions")
          .update({
            expires_at: expiresAt.toISOString(),
            paid_at: new Date().toISOString(),
            amount: amountUAH,
            wayforpay_id: invoiceId,
          })
          .eq("id", existingSub.id);
      } else {
        await supabaseAdmin.from("subscriptions").insert({
          courier_id: courierId,
          amount: amountUAH,
          status: "active",
          expires_at: expiresAt.toISOString(),
          paid_at: new Date().toISOString(),
          wayforpay_id: invoiceId,
        });
      }

      const { data: courierRow } = await supabaseAdmin
        .from("couriers")
        .update({ status: "active", debt_since: null, debt_amount: null, debt_auto: false })
        .eq("id", courierId)
        .select("full_name, phone, city")
        .single();

      console.log(`Payment success: courier=${courierId}, amount=${amountUAH} UAH`);

      // Сповіщення адміну про онлайн-оплату
      try {
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID;
        if (BOT_TOKEN && ADMIN_CHAT_ID) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: ADMIN_CHAT_ID,
              parse_mode: "HTML",
              text:
                "✅ <b>Оплата отримана онлайн</b>\n\n" +
                (courierRow?.full_name || courierId) + "\n" +
                (courierRow?.phone || "") + " | " + (courierRow?.city || "") + "\n" +
                "Сума: <b>" + amountUAH + " грн</b>\n" +
                "Метод: 💳 Онлайн (Monobank)",
            }),
          });
        }
      } catch (tgErr) {
        console.error("Admin telegram notify error:", tgErr);
      }
    } else if (status === "processing") {
      console.log(`Payment processing: invoiceId=${invoiceId}`);
    } else if (status === "failure") {
      console.log(`Payment failed: invoiceId=${invoiceId}, reason=${failureReason}`);
    } else if (status === "reversed") {
      await supabaseAdmin
        .from("payments")
        .update({ status: "refunded" })
        .eq("wayforpay_id", invoiceId);

      await supabaseAdmin
        .from("subscriptions")
        .update({ status: "cancelled" })
        .eq("wayforpay_id", invoiceId);

      console.log(`Payment reversed: invoiceId=${invoiceId}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Monobank webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}
