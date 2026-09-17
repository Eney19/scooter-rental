import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCourierIdFromCookies } from "@/lib/cabinet-session";

export async function GET() {
  const courierId = await getCourierIdFromCookies();
  if (!courierId) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const { data: courier, error } = await supabaseAdmin
    .from("couriers")
    .select(
      "id, full_name, phone, city, status, weekly_price, scooter_model, battery_types, " +
      "contract_pdf_url, contract_signed_at, return_pdf_url, return_signed_at, " +
      "subscription_start_date, debt_since, debt_amount, debt_auto, telegram_chat_id"
    )
    .eq("id", courierId)
    .maybeSingle();

  if (error || !courier) {
    return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
  }

  const { data: subscription } = await supabaseAdmin
    .from("subscriptions")
    .select("status, expires_at, amount, paid_at")
    .eq("courier_id", courierId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ success: true, courier, subscription: subscription || null });
}
