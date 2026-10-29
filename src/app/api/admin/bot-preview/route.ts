import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  getWeeklyPrice,
  daysOverdue,
  calculateOwedRent,
  calculatePenalty,
  daysSinceDebt,
  getBatteryWeeklyPrice,
  resolveDeposit,
  DEBT_PENALTY_PER_DAY,
} from "@/lib/pricing";
import { shouldChargeDeposit } from "@/lib/rental-history";

// Показує адміну той самий текст (борг + сума до оплати), що курʼєр бачить
// у Telegram-боті — рахунок зроблено за тими самими формулами й тими самими
// запитами, що й у src/lib/courier-bot.ts (sendStatus/getQuote), щоб картка
// в адмінці ніколи не розходилась із тим, що фактично надсилає бот.
export async function POST(req: NextRequest) {
  try {
    const { courierId } = await req.json();
    if (!courierId) {
      return NextResponse.json({ success: false, error: "courierId is required" }, { status: 400 });
    }

    const { data: courier } = await supabaseAdmin
      .from("couriers")
      .select("city, weekly_price, rental_type, battery_types, no_penalty, status, debt_since, debt_amount, debt_auto")
      .eq("id", courierId)
      .single();
    if (!courier) {
      return NextResponse.json({ success: false, error: "Курʼєра не знайдено" }, { status: 404 });
    }

    // Той самий запит, що й у sendStatus — остання підписка, незалежно від статусу.
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("status, expires_at")
      .eq("courier_id", courierId)
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Той самий запит, що й у getQuote — лише активні підписки.
    const { data: lastActive } = await supabaseAdmin
      .from("subscriptions")
      .select("expires_at")
      .eq("courier_id", courierId)
      .eq("status", "active")
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const status = courier.status || "pending";
    const weeklyPrice = getWeeklyPrice(courier);
    const batteryAmount = getBatteryWeeklyPrice(courier.battery_types);

    let debt: {
      rentDays: number;
      rentOwed: number;
      penaltyDays: number;
      penalty: number;
      total: number;
    } | null = null;
    if (status === "debtor") {
      const rentDays = sub ? daysOverdue(sub.expires_at) : 0;
      const useManualOverride = courier.debt_auto === false && typeof courier.debt_amount === "number";
      const rentOwed = useManualOverride ? (courier.debt_amount as number) : calculateOwedRent(weeklyPrice, rentDays);
      const penaltyDays = courier.debt_since ? daysSinceDebt(courier.debt_since) : 0;
      const penalty = useManualOverride ? 0 : calculatePenalty(penaltyDays, !!courier.no_penalty);
      debt = { rentDays, rentOwed, penaltyDays, penalty, total: rentOwed + penalty };
    }

    const late = lastActive ? daysOverdue(lastActive.expires_at) : 0;
    const useManualOverrideQuote = status === "debtor" && courier.debt_auto === false && typeof courier.debt_amount === "number";
    const rentOwedQuote = useManualOverrideQuote ? (courier.debt_amount as number) : calculateOwedRent(weeklyPrice, late);
    const penaltyQuote = useManualOverrideQuote ? 0 : calculatePenalty(late, !!courier.no_penalty);
    const firstPayment = await shouldChargeDeposit(courierId);
    const deposit = resolveDeposit(courier, firstPayment);

    const quote = {
      scooterAmount: rentOwedQuote - batteryAmount,
      batteryAmount,
      penalty: penaltyQuote,
      penaltyDays: penaltyQuote > 0 ? Math.round(penaltyQuote / DEBT_PENALTY_PER_DAY) : 0,
      deposit,
      total: rentOwedQuote + penaltyQuote + deposit,
    };

    return NextResponse.json({
      success: true,
      status,
      expiresAt: sub?.expires_at ?? null,
      weeklyPrice,
      debt,
      quote,
    });
  } catch (error) {
    console.error("admin bot-preview error", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
