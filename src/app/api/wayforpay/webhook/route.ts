import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

const SECRET_KEY = process.env.WAYFORPAY_SECRET_KEY!;

function generateSignature(params: string[]): string {
  const str = params.join(";");
  return createHmac("md5", SECRET_KEY).update(str).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const rawText = await req.text();
    let body: Record<string, unknown>;

    // WayForPay іноді надсилає чистий JSON-рядок навіть із заголовком
    // Content-Type: application/x-www-form-urlencoded, тож першим завжди
    // пробуємо розпарсити сирий текст як JSON.
    const trimmed = rawText.trim();
    if (trimmed.startsWith("{")) {
      body = JSON.parse(trimmed);
    } else {
      // Інакше це справжні form-параметри (key=value&key2=value2)
      const params = new URLSearchParams(trimmed);
      const parsed: Record<string, unknown> = {};
      for (const [key, value] of params.entries()) {
        parsed[key] = value;
      }
      body = parsed;
    }

    console.log("wayforpay webhook content-type:", contentType, "parsed body:", body);

    const {
      merchantAccount,
      orderReference,
      merchantSignature,
      amount,
      currency,
      authCode,
      email,
      phone,
      createdDate,
      processingDate,
      cardPan,
      cardType,
      issuerBankCountry,
      issuerBankName,
      recTokenLifetime,
      recToken,
      transactionStatus,
      reasonCode,
      reason,
    } = body as Record<string, string>;

    // Перевіряємо підпис
    const expectedSignature = generateSignature([
      merchantAccount,
      orderReference,
      amount,
      currency,
      authCode,
      cardPan,
      transactionStatus,
      reasonCode,
    ]);

    if (expectedSignature !== merchantSignature) {
      console.error("WayForPay webhook: invalid signature");
      return NextResponse.json({ status: "error", message: "Invalid signature" }, { status: 400 });
    }

    // Отримуємо courierId з orderReference (format: order_COURIER_ID_TIMESTAMP)
    const parts = orderReference.split("_");
    const courierId = parts[1];

    // Оновлюємо статус платежу
    const paymentStatus = transactionStatus === "Approved" ? "success" : "failed";

    const { error: paymentUpdateError } = await supabaseAdmin
      .from("payments")
      .update({
        status: paymentStatus,
        payment_method: cardType || "card",
      })
      .eq("courier_id", courierId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);

    if (paymentUpdateError) {
      console.error("WayForPay webhook: payment update failed:", paymentUpdateError);
    }

    // Якщо оплата успішна і є recToken — зберігаємо для рекурентних платежів
    if (transactionStatus === "Approved" && recToken) {
      await supabaseAdmin
        .from("couriers")
        .update({ wayforpay_token: recToken })
        .eq("id", courierId);

      // Створюємо або оновлюємо підписку
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const { data: existingSub } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("courier_id", courierId)
        .eq("status", "active")
        .single();

      if (existingSub) {
        const { error: subUpdateError } = await supabaseAdmin
          .from("subscriptions")
          .update({
            expires_at: expiresAt.toISOString(),
            paid_at: new Date().toISOString(),
            amount: parseFloat(amount),
            wayforpay_id: orderReference,
          })
          .eq("id", existingSub.id);

        if (subUpdateError) {
          console.error("WayForPay webhook: subscription update failed:", subUpdateError);
        }
      } else {
        const { error: subInsertError } = await supabaseAdmin.from("subscriptions").insert({
          courier_id: courierId,
          amount: parseFloat(amount),
          status: "active",
          expires_at: expiresAt.toISOString(),
          paid_at: new Date().toISOString(),
          wayforpay_id: orderReference,
        });

        if (subInsertError) {
          console.error("WayForPay webhook: subscription insert failed:", subInsertError);
        }
      }

      // Оновлюємо статус кур'єра
      await supabaseAdmin
        .from("couriers")
        .update({ status: "active" })
        .eq("id", courierId);
    }

    // Відповідь WayForPay (обов'язково)
    const responseSignature = generateSignature([
      orderReference,
      "accept",
      Math.floor(Date.now() / 1000).toString(),
    ]);

    return NextResponse.json({
      orderReference,
      status: "accept",
      time: Math.floor(Date.now() / 1000),
      signature: responseSignature,
    });

  } catch (error) {
    console.error("WayForPay webhook error:", error);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
