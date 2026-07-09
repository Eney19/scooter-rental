import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

const MERCHANT_ACCOUNT = process.env.WAYFORPAY_MERCHANT_ACCOUNT!;
const SECRET_KEY = process.env.WAYFORPAY_SECRET_KEY!;
const MERCHANT_DOMAIN = process.env.NEXT_PUBLIC_APP_URL || "https://powerdrive.in.ua";

function generateSignature(params: string[]): string {
  const str = params.join(";");
  return createHmac("md5", SECRET_KEY).update(str).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const { courierId, amount, description } = await req.json();

    // Отримуємо дані кур'єра
    const { data: courier, error } = await supabaseAdmin
      .from("couriers")
      .select("full_name, phone, email")
      .eq("id", courierId)
      .single();

    if (error || !courier) {
      return NextResponse.json({ success: false, error: "Кур'єра не знайдено" }, { status: 404 });
    }

    const orderReference = `order_${courierId}_${Date.now()}`;
    const orderDate = Math.floor(Date.now() / 1000).toString();
    const productName = description || "Оренда електроскутера (7 днів)";
    const amountStr = amount.toString();
    const currency = "UAH";

    // Генеруємо підпис
    const signature = generateSignature([
      MERCHANT_ACCOUNT,
      MERCHANT_DOMAIN,
      orderReference,
      orderDate,
      amountStr,
      currency,
      productName,
      "1",       // кількість
      amountStr, // ціна
    ]);

    // Зберігаємо платіж в БД
    await supabaseAdmin.from("payments").insert({
      courier_id: courierId,
      amount: parseFloat(amountStr),
      status: "pending",
      description: productName,
      payment_method: "wayforpay",
    });

    // Формуємо дані для WayForPay
    const paymentData = {
      merchantAccount: MERCHANT_ACCOUNT,
      merchantDomainName: MERCHANT_DOMAIN,
      orderReference,
      orderDate,
      amount: amountStr,
      currency,
      orderTimeout: 49000,
      productName: [productName],
      productCount: [1],
      productPrice: [amountStr],
      clientFirstName: courier.full_name.split(" ")[1] || "",
      clientLastName: courier.full_name.split(" ")[0] || "",
      clientPhone: courier.phone,
      clientEmail: courier.email || "",
      serviceUrl: `${MERCHANT_DOMAIN}/api/wayforpay/webhook`,
      returnUrl: `${MERCHANT_DOMAIN}/payment/success`,
      merchantSignature: signature,
      language: "UA",
      paymentSystems: "card;googlePay;applePay",
    };

    return NextResponse.json({ success: true, paymentData });

  } catch (error) {
    console.error("WayForPay create payment error:", error);
    return NextResponse.json({ success: false, error: "Помилка створення платежу" }, { status: 500 });
  }
}
