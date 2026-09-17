import { supabaseAdmin } from "@/lib/supabase";

// Спільна логіка продовження підписки. Використовується скрізь, де підписка
// може подовжуватись: monopay webhook, готівкова оплата (адмінка й Telegram).
//
// Головне правило: якщо в кур'єра ще є неспливлі оплачені дні (expires_at у
// майбутньому), нові 7 днів додаються ПІСЛЯ поточної дати закінчення, а не
// "від сьогодні" — інакше оплата наперед з'їдає вже оплачені дні. Якщо ж
// підписка вже прострочена (або її ще немає — кур'єр неактивний і бере
// скутер знову), відлік іде від поточного моменту.
export function nextExpiryFrom(currentExpiresAt: string | Date | null | undefined, referenceNow?: Date): Date {
  const now = referenceNow || new Date();
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

// Активація кур'єра після (готівкової) оплати — це один update(), від якого
// залежить, чи побачить адмін курʼєра як "Активний", а не той факт, що
// платіж/підписка вже записані. Раніше результат цього update() ніде не
// перевірявся: якщо Supabase повертав помилку (а не кидав виняток), вона
// мовчки ігнорувалась — платіж і підписка виглядали успішними, повідомлення
// "оплату підтверджено" йшло курʼєру, а couriers.status так і лишався
// "pending" назавжди (саме це сталося з Зубенко Сергієм Євгенійовичем).
// Тепер перевіряємо помилку, ретраїмо один раз і повертаємо результат —
// виклик має сповістити адміна, якщо це не допомогло.
export async function activateCourier(
  courierId: string,
  extra: Record<string, unknown> = {}
): Promise<{ ok: boolean; error: string | null }> {
  const payload = { status: "active", ...extra };

  let { error } = await supabaseAdmin.from("couriers").update(payload).eq("id", courierId);
  if (error) {
    console.error("activateCourier: update failed, retrying once", error, "courierId:", courierId);
    await new Promise((resolve) => setTimeout(resolve, 800));
    ({ error } = await supabaseAdmin.from("couriers").update(payload).eq("id", courierId));
  }
  if (error) {
    console.error("activateCourier: update failed after retry", error, "courierId:", courierId);
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}

