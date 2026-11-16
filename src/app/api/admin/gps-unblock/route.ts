import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendGpsBlockRequest } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  try {
    const { scooterId } = await req.json();
    if (!scooterId) {
      return NextResponse.json({ success: false, error: "scooterId is required" }, { status: 400 });
    }

    const { data: scooter } = await supabaseAdmin
      .from("scooters")
      .select("name, gps_sim_phone, courier:couriers(full_name)")
      .eq("id", scooterId)
      .single();

    if (!scooter?.gps_sim_phone) {
      return NextResponse.json({ success: false, error: "У скутера не вказано номер SIM-картки трекера" }, { status: 400 });
    }

    const courier = Array.isArray(scooter.courier) ? scooter.courier[0] : scooter.courier;

    await sendGpsBlockRequest({
      courierName: courier?.full_name ?? null,
      scooterName: scooter.name,
      simPhone: scooter.gps_sim_phone,
      action: "unblock",
    });

    await supabaseAdmin
      .from("scooters")
      .update({ gps_locked: false, gps_locked_at: null })
      .eq("id", scooterId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("admin gps-unblock error", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
