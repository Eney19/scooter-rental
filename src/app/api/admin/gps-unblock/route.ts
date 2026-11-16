import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { unblockScooterByGps } from "@/lib/gps-tracker";

export async function POST(req: NextRequest) {
  try {
    const { scooterId } = await req.json();
    if (!scooterId) {
      return NextResponse.json({ success: false, error: "scooterId is required" }, { status: 400 });
    }

    const { data: scooter } = await supabaseAdmin
      .from("scooters")
      .select("gps_sim_phone")
      .eq("id", scooterId)
      .single();

    if (!scooter?.gps_sim_phone) {
      return NextResponse.json({ success: false, error: "У скутера не вказано номер SIM-картки трекера" }, { status: 400 });
    }

    const result = await unblockScooterByGps(scooter.gps_sim_phone);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }

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
