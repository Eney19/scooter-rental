import { supabaseAdmin } from "@/lib/supabase";

// Спільна логіка продовження підписки. Використовується скрізь, де підписка
// може подовжуватись: monopay webhook, готівкова оплата (адмінка й Telegram).
//
// Головне правило: якщо в кур'єра ще є неспливлі оплачені дні (expires_at у
// майбутньому), нові 7 днів додаються ПІСЛЯ поточної дати закінчення, а не
// "від сьогодні" — інакше оплата наперед з'їдає вже оплачені дні. Якщо ж
// підписка вже прострочена (або її ще немає — кур'єр неактивний і бере
// скутер знову), відлік іде від поточного моменту.
export function nextExpiryFrom(currentExpiresAt: string | Date | null | undefined): Date {
  const now = new Date();
  const currentExpiry = currentExpiresAt ? new Date(currentExpiresAt) : null;
  const base = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  const next = new Date(base);
  next.setDate(next.getDate() + 7);
  return next;
}

// Перша оплата кур'єра (ще немає жодної підписки) — саме тоді додатково
// стягується одноразовий завдаток за скутер (сума залежить від міста).
// Використовується однаково для онлайн- і готівкової оплати.
export async function isFirstPayment(courierId: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("courier_id", courierId);
  return !count;
}
