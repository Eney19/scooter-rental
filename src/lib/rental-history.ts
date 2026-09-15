import { supabaseAdmin } from "@/lib/supabase";

type PeriodSnapshot = {
  city: string | null;
  scooterModel: string | null;
  batteryTypes: string[] | null;
  weeklyPrice: number | null;
  contractSignedAt: string | null;
};

// Викликати щоразу, коли кур'єр переходить із "не активний" в "активний" —
// тобто щойно взяв скутер (вперше при реєстрації, або повторно після
// попереднього повернення). Якщо в нього вже є відкритий період (без
// ended_at) — нічого не робимо: це просто оплата наперед у межах того самого
// періоду оренди, а не нове взяття скутера.
export async function openRentalPeriod(courierId: string, snapshot: PeriodSnapshot): Promise<void> {
  try {
    const { data: open, error: lookupError } = await supabaseAdmin
      .from("rental_periods")
      .select("id")
      .eq("courier_id", courierId)
      .is("ended_at", null)
      .maybeSingle();

    if (lookupError) {
      console.error("openRentalPeriod lookup error:", lookupError);
      return;
    }
    if (open) return;

    const { error } = await supabaseAdmin.from("rental_periods").insert({
      courier_id: courierId,
      city: snapshot.city,
      scooter_model: snapshot.scooterModel,
      battery_types: snapshot.batteryTypes,
      weekly_price: snapshot.weeklyPrice,
      contract_signed_at: snapshot.contractSignedAt,
      started_at: new Date().toISOString(),
    });
    if (error) {
      console.error("openRentalPeriod insert error:", error);
    }
  } catch (e) {
    console.error("openRentalPeriod error:", e);
  }
}

// Викликати, коли кур'єр здає скутер (стає "неактивний") — закриваємо
// поточний відкритий період оренди датою повернення.
export async function closeRentalPeriod(courierId: string, endedAt: string = new Date().toISOString()): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("rental_periods")
      .update({ ended_at: endedAt })
      .eq("courier_id", courierId)
      .is("ended_at", null);
    if (error) {
      console.error("closeRentalPeriod error:", error);
    }
  } catch (e) {
    console.error("closeRentalPeriod error:", e);
  }
}
