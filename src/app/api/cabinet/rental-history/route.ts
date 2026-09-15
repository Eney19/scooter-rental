import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCourierIdFromCookies } from "@/lib/cabinet-session";

export async function GET() {
  const courierId = await getCourierIdFromCookies();
  if (!courierId) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const { data: periods, error } = await supabaseAdmin
    .from("rental_periods")
    .select(
      "id, city, scooter_model, battery_types, weekly_price, contract_signed_at, started_at, ended_at"
    )
    .eq("courier_id", courierId)
    .order("started_at", { ascending: false });

  if (error) {
    console.error("cabinet rental-history error", error);
    return NextResponse.json({ success: false, error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ success: true, periods: periods || [] });
}
