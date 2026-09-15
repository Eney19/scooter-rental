import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCourierIdFromCookies } from "@/lib/cabinet-session";

export async function GET() {
  const courierId = await getCourierIdFromCookies();
  if (!courierId) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const { data: payments, error } = await supabaseAdmin
    .from("payments")
    .select("id, amount, type, status, wayforpay_id, created_at")
    .eq("courier_id", courierId)
    .eq("status", "success")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("cabinet payments error", error);
    return NextResponse.json({ success: false, error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ success: true, payments: payments || [] });
}
