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

  // ВАЖЛИВО: одного лише `error === null` недостатньо. Якщо `.eq("id", courierId)`
  // з якоїсь причини не знайде жодного рядка (наприклад, courierId вже не існує),
  // Supabase поверне success БЕЗ помилки — оновлених рядків просто буде 0, і раніше
  // це виглядало як успішна активація, хоча couriers.status ніхто не міняв.
  // Тому просимо `.select("id")` і перевіряємо, що рядок справді знайдено й оновлено.
  const attempt = async () =>
    supabaseAdmin.from("couriers").update(payload).eq("id", courierId).select("id");

  let { data, error } = await attempt();
  if (error || !data || data.length === 0) {
    console.error(
      "activateCourier: update failed or matched 0 rows, retrying once",
      error, "rowsMatched:", data?.length ?? 0, "courierId:", courierId
    );
    await new Promise((resolve) => setTimeout(resolve, 800));
    ({ data, error } = await attempt());
  }
  if (error) {
    console.error("activateCourier: update failed after retry", error, "courierId:", courierId);
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) {
    console.error("activateCourier: update matched 0 rows after retry", "courierId:", courierId);
    return { ok: false, error: `Рядок кур'єра з id=${courierId} не знайдено при оновленні (0 рядків оновлено)` };
  }
  return { ok: true, error: null };
}

