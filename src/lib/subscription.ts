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
