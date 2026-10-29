import { supabaseAdmin } from "./supabase";

// Пауза для VIP-курʼєрів: поки couriers.paused_from заповнене — курʼєр
// вважається "на паузі", і жоден cron (нагадування/борг/прострочення) не
// повинен його чіпати. paused_until — заплановане закінчення паузи (якщо
// задане); коли воно настає, resumeExpiredPauses() знімає паузу
// автоматично. Будь-яка пауза (авто- чи ручне зняття) продовжує активну
// підписку курʼєра рівно на тривалість паузи, щоб час на паузі не
// рахувався як "використаний" термін оренди.
export function isPaused(courier: { paused_from?: string | null }): boolean {
  return !!courier.paused_from;
}

async function extendActiveSubscription(courierId: string, durationMs: number): Promise<void> {
  if (durationMs <= 0) return;
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("id, expires_at")
    .eq("courier_id", courierId)
    .eq("status", "active")
    .maybeSingle();
  if (!sub) return;
  const newExpiresAt = new Date(new Date(sub.expires_at).getTime() + durationMs).toISOString();
  await supabaseAdmin.from("subscriptions").update({ expires_at: newExpiresAt }).eq("id", sub.id);
}

export async function resumeCourier(courierId: string, durationMs: number): Promise<void> {
  await extendActiveSubscription(courierId, durationMs);
  await supabaseAdmin
    .from("couriers")
    .update({ paused_from: null, paused_until: null, debt_since: null, debt_amount: null, debt_auto: false })
    .eq("id", courierId);
}

// Викликається на початку кожного cron-роуту: автоматично знімає паузу з
// усіх курʼєрів, чиє заплановане paused_until уже настало, а адмін не
// зняв її вручну — підписка продовжується рівно на заплановану тривалість
// паузи (paused_until - paused_from), щоб подальші debt/overdue-перевірки
// того самого прогону вже бачили коректну, продовжену дату.
export async function resumeExpiredPauses(): Promise<number> {
  const { data: expired } = await supabaseAdmin
    .from("couriers")
    .select("id, paused_from, paused_until")
    .not("paused_from", "is", null)
    .not("paused_until", "is", null)
    .lt("paused_until", new Date().toISOString());

  let count = 0;
  for (const c of expired || []) {
    const durationMs = new Date(c.paused_until as string).getTime() - new Date(c.paused_from as string).getTime();
    await resumeCourier(c.id, durationMs);
    count++;
  }
  return count;
}
