import { supabaseAdmin } from "@/lib/supabase";

// Спільна логіка продовження підписки. Використовується скрізь, де підписка
// може подовжуватись: monopay webhook, готівкова оплата (адмінка й Telegram).
//
// Якщо в кур'єра ще є неспливлі оплачені дні (expires_at у майбутньому),
// нові 7 днів додаються ПІСЛЯ поточної дати закінчення, а не "від сьогодні"
// — інакше оплата наперед з'їдає вже оплачені дні.
//
// Якщо підписка вже прострочена — РАНІШЕ тут рахували +7 днів від "зараз",
// і це означало, що прострочені дні кур'єру дарувались безкоштовно, а графік
// платежів щоразу зсувався далі в майбутнє (що пізніше платиш — то довшу
// безкоштовну паузу отримуєш назавжди). Приклад: Твердохліб мав заплатити
// 30.10, прострочив на кілька днів і заплатив 02.11 — підписка продовжилась
// до 09.11 (02.11+7) замість 06.11 (30.10+7), тобто прострочені дні просто
// зникли на його користь. Тепер продовжуємо ВІД СТАРОЇ ДАТИ закінчення
// (а не від сьогодні) на щонайменше 7 днів, або на стільки днів, скільки
// фактично прострочено, якщо прострочення довше тижня — узгоджено з
// calculateOwedRent (pricing.ts), яка так само бере max(тижневий тариф,
// пропорційно дням прострочення): скільки днів фактично оплачено, стільки
// й додається до підписки, графік не зсувається.
//
// Якщо активної підписки взагалі немає (кур'єр неактивний і бере скутер
// знову) — відлік іде від поточного моменту, бо продовжувати нема від чого.
export function nextExpiryFrom(currentExpiresAt: string | Date | null | undefined, referenceNow?: Date): Date {
  const now = referenceNow || new Date();
  const currentExpiry = currentExpiresAt ? new Date(currentExpiresAt) : null;

  if (!currentExpiry) {
    const next = new Date(now);
    next.setDate(next.getDate() + 7);
    return next;
  }

  if (currentExpiry.getTime() > now.getTime()) {
    const next = new Date(currentExpiry);
    next.setDate(next.getDate() + 7);
    return next;
  }

  const diffMs = now.getTime() - currentExpiry.getTime();
  const daysLate = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  const daysToAdd = Math.max(7, daysLate);
  const next = new Date(currentExpiry);
  next.setDate(next.getDate() + daysToAdd);
  return next;
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

