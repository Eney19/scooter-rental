import { supabaseAdmin } from "@/lib/supabase";
import { calculateDebtLedger, type DebtLedger, type RecalcPaymentInput } from "@/lib/pricing";

// Єдине місце, де серверні роути дістають повну історію платежів кур'єра і
// рахують його реальний борг за методикою: Нараховано (дні оренди × денна
// ставка) − Оплачено (сума фактичних оплат за скутер) = Залишок боргу,
// плюс пеня окремо. Раніше кожен роут (готівкова/онлайн оплата, Telegram-
// бот, cron-и) рахував "скільки винен" по-своєму — від поточної
// subscriptions.expires_at, без історії платежів — і ці числа могли
// розходитися між собою й з тим, що показує адмінка. Тепер усі йдуть сюди.
export async function loadCourierDebtLedger(
  courierId: string,
  weeklyPrice: number,
  subscriptionStartDate: string | Date | null,
  returnDate: string | Date | null,
  noPenalty = false
): Promise<DebtLedger> {
  const { data } = await supabaseAdmin
    .from("payments")
    .select("amount, deposit, battery_amount, status, created_at")
    .eq("courier_id", courierId)
    .in("status", ["success", "failed"]);
  const payments = (data || []) as RecalcPaymentInput[];
  return calculateDebtLedger(weeklyPrice, subscriptionStartDate, returnDate, payments, noPenalty);
}
