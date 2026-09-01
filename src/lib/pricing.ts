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