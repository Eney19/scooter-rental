// Централізована логіка цін: пріоритет — індивідуальна ціна кур'єра, потім дефолт по місту

const WEEKLY_PRICE_BY_CITY: Record<string, number> = {
    "Луцьк": 2400,
    "Рівне": 2400,
    "Львів": 2100,
  };
  const DEFAULT_WEEKLY_PRICE = 2400;
  const PENALTY_PER_DAY = 50;
  
  export function getWeeklyPrice(courier: { city?: string | null; weekly_price?: number | null }): number {
    if (courier.weekly_price && courier.weekly_price > 0) return courier.weekly_price;
    if (!courier.city) return DEFAULT_WEEKLY_PRICE;
    return WEEKLY_PRICE_BY_CITY[courier.city.trim()] ?? DEFAULT_WEEKLY_PRICE;
  }
  
  // Кількість повних днів прострочення від дати закінчення підписки до зараз.
  // 0 — ще не прострочено, 1 — перший день прострочення, і т.д.
  export function daysOverdue(expiresAt: string | Date): number {
    const expires = new Date(expiresAt);
    const now = new Date();
    const diffMs = now.getTime() - expires.getTime();
    if (diffMs <= 0) return 0;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  }
  
  export function calculatePenalty(daysLate: number): number {
    return Math.max(0, daysLate) * PENALTY_PER_DAY;
  }
  
  export function totalWithPenalty(baseAmount: number, daysLate: number): number {
    return baseAmount + calculatePenalty(daysLate);
  }

  // Завдаток за скутер — стягується лише один раз, при першій оплаті кур'єра.
  const DEPOSIT_BY_CITY: Record<string, number> = {
    "Луцьк": 1400,
    "Рівне": 1400,
    "Львів": 2100,
  };
  const DEFAULT_DEPOSIT = 1400;

  export function getDepositAmount(city?: string | null): number {
    if (!city) return DEFAULT_DEPOSIT;
    return DEPOSIT_BY_CITY[city.trim()] ?? DEFAULT_DEPOSIT;
  }
  // Заборгованість ("Боржник"): якщо кур'єр не оплатив підписку і не здав скутер
  // протягом DEBT_GRACE_DAYS днів після закінчення підписки, він автоматично
  // стає боржником. З цього моменту щодня нараховується пеня DEBT_PENALTY_PER_DAY.
  export const DEBT_GRACE_DAYS = 7;
  export const DEBT_PENALTY_PER_DAY = 150;

  // Дата, з якої кур'єр офіційно вважається боржником: через DEBT_GRACE_DAYS днів
  // після дати закінчення підписки (фіксована дата, не залежить від того, коли саме
  // спрацював cron).
  export function calculateDebtSince(expiresAt: string | Date): Date {
    const d = new Date(expiresAt);
    d.setDate(d.getDate() + DEBT_GRACE_DAYS);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Скільки повних днів минуло з дати, коли кур'єр став боржником (0 — у сам цей день).
  export function daysSinceDebt(debtSince: string | Date): number {
    const start = new Date(debtSince);
    start.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffMs = now.getTime() - start.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  // Автоматична сума боргу: базова сума (тиждень оренди, який не оплатили) +
  // пеня DEBT_PENALTY_PER_DAY грн за кожен день з моменту, коли кур'єр став боржником.
  export function calculateAutoDebt(baseAmount: number, debtSince: string | Date): number {
    return baseAmount + daysSinceDebt(debtSince) * DEBT_PENALTY_PER_DAY;
  }
