import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { blockScooterByGps } from "@/lib/gps-tracker";

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

    const result = await blockScooterByGps(scooter.gps_sim_phone);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }

    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("scooters")
      .update({ gps_locked: true, gps_locked_at: nowIso })
      .eq("id", scooterId);

    return NextResponse.json({ success: true, gpsLockedAt: nowIso });
  } catch (error) {
    console.error("admin gps-block error", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
