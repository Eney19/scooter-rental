import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { courierId } = await req.json();

    if (!courierId) {
      return NextResponse.json({ success: false, error: "courierId is required" }, { status: 400 });
    }

    const { data: courier, error: courierErr } = await supabaseAdmin
      .from("couriers")
      .select("id, full_name")
      .eq("id", courierId)
      .single();

    if (courierErr || !courier) {
      return NextResponse.json({ success: false, error: "Кур'єра не знайдено" }, { status: 404 });
    }

    await supabaseAdmin
      .from("couriers")
      .update({
        status: "inactive",
        debt_since: null,
        debt_amount: null,
        debt_auto: false,
      })
      .eq("id", courierId);

    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("courier_id", courierId)
      .eq("status", "active");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("admin scooter-return-no-act error", error);
    return NextResponse.json({ success: false, error: "Внутрішня помилка" }, { status: 500 });
  }
}
