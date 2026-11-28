// Централізована логіка цін: пріоритет — індивідуальна ціна кур'єра, потім дефолт по місту

const WEEKLY_PRICE_BY_CITY: Record<string, number> = {
    "Луцьк": 2400,
    "Рівне": 2400,
    "Львів": 2100,
  };
  const DEFAULT_WEEKLY_PRICE = 2400;
  const PENALTY_PER_DAY = 50;
  
  // Курʼєр, який орендує ЛИШЕ акумулятор (без скутера, rental_type ===
  // "battery_only") — тариф повністю визначається вибраним акумулятором
  // (getBatteryWeeklyPrice), а не couriers.weekly_price/містом: ці курʼєри
  // не платять за скутер взагалі. Це єдине місце, де вирішується "скутер
  // чи лише акумулятор" — всі місця, що рахують оренду/борг/оплату,
  // використовують саме getWeeklyPrice і автоматично підхоплюють це.
  export function getWeeklyPrice(courier: { city?: string | null; weekly_price?: number | null; rental_type?: string | null; battery_types?: string[] | null }): number {
    if (courier.rental_type === "battery_only") {
      // weekly_price тут — ручне перевизначення тарифу адміном (напр., коли
      // акумулятор видано без вибору в battery_types, або тариф
      // домовлений індивідуально). Якщо не задане — тариф як завжди
      // рахується від обраних акумуляторів.
      if (courier.weekly_price && courier.weekly_price > 0) return courier.weekly_price;
      return getBatteryWeeklyPrice(courier.battery_types);
    }
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
  
  // noPenalty — адмін вимкнув нарахування пені для цього курʼєра (couriers.no_penalty).
  export function calculatePenalty(daysLate: number, noPenalty = false): number {
    if (noPenalty) return 0;
    return Math.max(0, daysLate) * PENALTY_PER_DAY;
  }

  // Скільки орендної плати (без пені) кур'єр фактично винен. Якщо прострочення
  // немає (daysLate<=0) — звичайна оплата: рівно один тижневий тариф, як і
  // раніше. Якщо прострочено — тариф пропорційно дням прострочення (тижневий
  // тариф / 7 × кількість днів), а НЕ завжди фіксовано один тиждень: інакше
  // боржник за 3 тижні платив би стільки ж, скільки за кілька днів.
  // Мінімум — повний тижневий тариф (як і для прострочення немає): навіть
  // курʼєр, який прострочив лише 1-2 дні, платить за повний тиждень (а не
  // пропорційно 1-2 дням) — nextExpiryFrom (subscription.ts) продовжує
  // підписку на ті самі щонайменше 7 днів ВІД СТАРОЇ ДАТИ закінчення (не від
  // сьогодні), тож графік не зсувається і прострочені дні не даруються
  // безкоштовно. Пропорційний розрахунок лише ДОДАЄ зверху для тих, хто
  // прострочив довше за тиждень, а не зменшує суму для щойно прострочених.
  export function calculateOwedRent(weeklyPrice: number, daysLate: number): number {
    if (daysLate <= 0) return weeklyPrice;
    return Math.max(weeklyPrice, Math.round((weeklyPrice / 7) * daysLate));
  }

  export function totalWithPenalty(weeklyPrice: number, daysLate: number, noPenalty = false): number {
    return calculateOwedRent(weeklyPrice, daysLate) + calculatePenalty(daysLate, noPenalty);
  }

  // Завдаток за скутер — стягується лише один раз, при першій оплаті кур'єра.
  const DEPOSIT_BY_CITY: Record<string, number> = {
    "Луцьк": 1400,
    "Рівне": 1400,
    "Львів": 1200,
  };
  const DEFAULT_DEPOSIT = 1400;

  export function getDepositAmount(city?: string | null): number {
    if (!city) return DEFAULT_DEPOSIT;
    return DEPOSIT_BY_CITY[city.trim()] ?? DEFAULT_DEPOSIT;
  }

  // Єдине місце, де вирішується, чи стягувати завдаток із цього платежу і
  // яка саме сума: курʼєри, які орендують ЛИШЕ акумулятор
  // (rental_type === "battery_only"), завдаток не платять ніколи (нема
  // скутера, який він мав би забезпечувати) — незалежно від того, чи це в
  // них перше взяття. Для решти курʼєрів адмін може задати курʼєру
  // персональний завдаток (couriers.deposit_amount) замість стандартного
  // по місту — наприклад, якщо йому фактично внесли іншу суму; якщо поле
  // не задане (null), використовується стандартний getDepositAmount(city).
  // Усі місця, що рахують суму до оплати чи борг, мають викликати саме цю
  // функцію, а не `chargeDeposit ? getDepositAmount(city) : 0` напряму,
  // інакше при появі нового типу оренди чи персонального завдатку щось
  // знову почне рахуватись по-старому десь по закутках.
  export function resolveDeposit(
    courier: { city?: string | null; rental_type?: string | null; deposit_amount?: number | null },
    chargeDeposit: boolean
  ): number {
    if (courier.rental_type === "battery_only") return 0;
    if (!chargeDeposit) return 0;
    return typeof courier.deposit_amount === "number" ? courier.deposit_amount : getDepositAmount(courier.city);
  }

  // Оренда акумулятора — опційна, обирається під час реєстрації паралельно зі
  // скутером (можна вибрати кілька) і додається до тижневої оренди скутера.
  export const BATTERY_OPTIONS = [
    { id: "60A", label: "Акумулятор 60 А", weeklyPrice: 800 },
    { id: "70A", label: "Акумулятор 70 А", weeklyPrice: 1000 },
  ] as const;

  export function getBatteryWeeklyPrice(batteryIds: string[] | null | undefined): number {
    if (!batteryIds || batteryIds.length === 0) return 0;
    return batteryIds.reduce((sum, id) => {
      const opt = BATTERY_OPTIONS.find(b => b.id === id);
      return sum + (opt?.weeklyPrice || 0);
    }, 0);
  }

  export function getBatteryLabels(batteryIds: string[] | null | undefined): string[] {
    if (!batteryIds || batteryIds.length === 0) return [];
    return batteryIds
      .map(id => BATTERY_OPTIONS.find(b => b.id === id)?.label as string | undefined)
      .filter(Boolean) as string[];
  }

  // Розбиває суму оренди на "скутер" і "акумулятор" для показу в
  // квитанціях, повідомленнях адміну та Telegram-боті. Курʼєр, що орендує
  // ЛИШЕ акумулятор (rental_type === "battery_only"), не має окремого
  // "скутера" взагалі — уся сума належить акумулятору. Без цієї перевірки
  // код скрізь напряму рахував `rentAmount - batteryWeeklyPrice` як
  // "скутер", що для такого курʼєра означало вигадану ненульову суму
  // оренди скутера, якого в нього немає (знайдено на Древалю Артему
  // Ігоровичу, 27.11.2026: прострочений борг показував "Оренда скутера
  // 1236 грн", хоча весь його тариф — акумулятор).
  export function splitRentForDisplay(
    rentalType: string | null | undefined,
    rentAmount: number,
    batteryWeeklyPrice: number
  ): { scooterAmount: number; batteryAmount: number } {
    if (rentalType === "battery_only") {
      return { scooterAmount: 0, batteryAmount: rentAmount };
    }
    return { scooterAmount: rentAmount - batteryWeeklyPrice, batteryAmount: batteryWeeklyPrice };
  }

  // Сума, яку зберігаємо в payments.battery_amount — вона виключається з
  // щоденного розрахунку боргу (calculateRentalLedger вважає її окремим
  // зобов'язанням поверх орендної плати за скутер). Для курʼєра "лише
  // акумулятор" це неправильно: денна ставка (getWeeklyPrice) для нього і
  // Є ціною акумулятора, виключати з "Оплачено" нічого не треба — інакше
  // ввесь платіж зникає з розрахунку, і борг рахується так, ніби курʼєр
  // узагалі не платив (той самий кейс Древаля: один платіж 1000 грн з
  // battery_amount=1000 робив "Оплачено" = 0).
  // ---------------------------------------------------------------------------
// "Оплачено до" з історії платежів — єдина формула для адмінки (відображення
// "Оплата з ... по ...", перерахунок підписки) і бекенду (/api/admin/cash-payment).
//
// Відлік іде від дати старту підписки (couriers.subscription_start_date), а
// кожен успішний платіж додає рівно стільки днів, скільки покриває його
// орендна частина за денним тарифом (weeklyPrice/7). Дні рахуються з
// НАКОПИЧЕНОЇ суми (а не округлюються по кожному платежу окремо), тож
// залишки менші за день не губляться, а складаються.
//
// Раніше кожен платіж вважався рівно одним тижнем незалежно від суми, а
// відлік ішов від дати першого платежу, а не від дати старту підписки —
// тож при ручному відтворенні історії (виставили дату старту, завели кілька
// готівкових оплат заднім числом) "Оплачено до" і "+N тижнів наперед"
// рахувались неправильно (Галас Володимир Сергійович, 28.11.2026).
// ---------------------------------------------------------------------------
export type PeriodPayment = {
  id: string;
  amount: number;
  deposit: number | null;
  battery_amount: number | null;
  created_at: string;
  status?: string | null;
  type?: string | null;
};

// Яка частина платежу йде саме на тариф (без завдатку і без акумулятора-
// додатку). Для "лише акумулятор" увесь залишок після завдатку і є тариф.
export function rentPortionOfPayment(p: PeriodPayment, rentalType: string | null | undefined): number {
  const deposit = p.deposit || 0;
  const battery = rentalType === "battery_only" ? 0 : (p.battery_amount || 0);
  return Math.max(0, p.amount - deposit - battery);
}

export function computePaymentPeriods(
  payments: PeriodPayment[],
  weeklyPrice: number,
  rentalType: string | null | undefined,
  subscriptionStart?: string | null
): Record<string, { start: Date; end: Date }> {
  const ordered = payments
    .filter(p => p.status === "success" && !isPenaltyPayment(p))
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const dayRate = weeklyPrice > 0 ? weeklyPrice / 7 : 0;
  const startDate = subscriptionStart ? new Date(subscriptionStart) : null;
  const startDay = startDate ? new Date(startDate) : null;
  if (startDay) startDay.setHours(0, 0, 0, 0);

  const periods: Record<string, { start: Date; end: Date }> = {};
  let anchor: Date | null = null;
  let anchoredToStart = false;
  let cumulative = 0;
  let prevEnd: Date | null = null;

  for (const p of ordered) {
    const paidAt = new Date(p.created_at);
    // Перший платіж поточної підписки (від дати старту і пізніше) —
    // відлік починається з дати старту підписки. Платежі з попередніх
    // оренд (до дати старту) рахуються окремим ланцюжком від своєї дати.
    if (startDate && startDay && !anchoredToStart && paidAt.getTime() >= startDay.getTime()) {
      anchor = startDate;
      anchoredToStart = true;
      cumulative = 0;
      prevEnd = startDate;
    } else if (!anchor) {
      anchor = paidAt;
      cumulative = 0;
      prevEnd = paidAt;
    }
    cumulative += rentPortionOfPayment(p, rentalType);
    const days = dayRate > 0 ? Math.floor(cumulative / dayRate + 1e-9) : 0;
    const end = new Date(anchor as Date);
    end.setDate(end.getDate() + days);
    periods[p.id] = { start: prevEnd as Date, end };
    prevEnd = end;
  }
  return periods;
}

// Кінцева дата "Оплачено до" для поточної підписки (null — платежів нема).
export function computePaidThrough(
  payments: PeriodPayment[],
  weeklyPrice: number,
  rentalType: string | null | undefined,
  subscriptionStart?: string | null
): Date | null {
  const periods = computePaymentPeriods(payments, weeklyPrice, rentalType, subscriptionStart);
  const ordered = payments
    .filter(p => p.status === "success" && !isPenaltyPayment(p))
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const last = ordered[ordered.length - 1];
  return last ? periods[last.id]?.end ?? null : null;
}

export function batteryAmountForLedger(rentalType: string | null | undefined, batteryWeeklyPrice: number): number {
    return rentalType === "battery_only" ? 0 : batteryWeeklyPrice;
  }
  // Заборгованість ("Боржник"): якщо кур'єр не оплатив підписку і не здав скутер,
  // він автоматично стає боржником з наступного дня після закінчення підписки
  // (DEBT_GRACE_DAYS = 1 — пільговий день, щоб не позначати боржником одразу
  // ж у сам день, коли сплив термін оплати). З дня, коли курʼєр став боржником,
  // щодня нараховується пеня DEBT_PENALTY_PER_DAY.
  export const DEBT_GRACE_DAYS = 1;
  export const DEBT_PENALTY_PER_DAY = 50;

  // Дата, з якої кур'єр офіційно вважається боржником — наступний день після
  // закінчення підписки (expires_at + DEBT_GRACE_DAYS), опівночі.
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

  // Автоматична сума боргу: орендна плата за весь прострочений період
  // (пропорційно дням з моменту закінчення підписки, calculateOwedRent) +
  // пеня DEBT_PENALTY_PER_DAY грн за кожен день з моменту, коли кур'єр
  // офіційно став боржником (debtSince, з пільговим днем — може трохи
  // відставати від daysLate, рахованого від самого expiresAt).
  export function calculateAutoDebt(weeklyPrice: number, expiresAt: string | Date, debtSince: string | Date, noPenalty = false): number {
    const rent = calculateOwedRent(weeklyPrice, daysOverdue(expiresAt));
    if (noPenalty) return rent;
    return rent + daysSinceDebt(debtSince) * DEBT_PENALTY_PER_DAY;
  }

  // Відновлює РЕАЛЬНУ заборгованість кур'єра виключно з історії платежів —
  // ігноруючи couriers.debt_amount/subscriptions.expires_at (які могли бути
  // неправильно обнулені частковою оплатою, яку минулий баг у
  // /api/admin/cash-payment сприймав як повну — див. випадок Бойка Тимофія
  // Анатолійовича, 24.11.2026). Логіка: починаючи з дати старту підписки,
  // проходимо всі успішні платежі в хронологічному порядку і для кожного
  // рахуємо, на скільки ДНІВ оренди скутера він реально вистачив (сума,
  // поділена на денну ставку тарифу) — підсумкова дата й буде справжнім
  // "оплачено по", а не тим, що показує ланцюжок +7 днів чи (раніше)
  // безумовне "оплата закрила все".
  // ПРИМІТКА: акумулятор (battery_amount) з розрахунку виключається (це
  // окреме зобов'язання) — рахується лише борг за сам скутер; тариф береться
  // поточний (getWeeklyPrice), а не історичний на момент кожного платежу.
  // Завдаток (depositAmount — стандартна сума для міста, getDepositAmount/
  // resolveDeposit, а НЕ довільне поле p.deposit окремого платежу, яке
  // часто просто не заповнене) віднімається ОДИН РАЗ, з найперших платежів
  // курʼєра (а не з кожного) — бо стягується він одноразово на старті
  // оренди і потім повертається, тож у рахунок орендної плати не йде.
  export type RecalcPaymentInput = {
    amount: number;
    deposit: number | null;
    battery_amount: number | null;
    status: string | null;
    created_at: string;
    type?: string | null;
  };

  // Пеня, сплачена курʼєром, записується ОКРЕМИМ платежем (payments.type =
  // "penalty") і НЕ йде в рахунок орендної плати: не додає оплачених днів і
  // не зменшує "Залишок боргу" за оренду. Раніше пеня йшла в одному платежі
  // з орендою і перетворювалась на зайві "оплачені" дні.
  export const PENALTY_PAYMENT_TYPE = "penalty";
  export function isPenaltyPayment(p: { type?: string | null }): boolean {
    return p.type === PENALTY_PAYMENT_TYPE;
  }

  export type RecalculatedDebt = {
    paidThroughDate: Date;
    daysLate: number;
    rentOwed: number;
    penalty: number;
    totalDebt: number;
  };

  export function recalculateDebtFromHistory(
    weeklyPrice: number,
    subscriptionStartDate: string | Date | null,
    payments: RecalcPaymentInput[],
    noPenalty = false,
    depositAmount = 0
  ): RecalculatedDebt {
    const dayRate = weeklyPrice / 7;
    const successPayments = payments
      .filter(p => p.status !== "failed" && !isPenaltyPayment(p))
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    let paidThrough = subscriptionStartDate
      ? new Date(subscriptionStartDate)
      : (successPayments[0] ? new Date(successPayments[0].created_at) : new Date());

    let depositLeft = depositAmount;
    for (const p of successPayments) {
      let scooterAmount = p.amount - (p.battery_amount || 0);
      if (depositLeft > 0) {
        const deduct = Math.min(depositLeft, Math.max(0, scooterAmount));
        scooterAmount -= deduct;
        depositLeft -= deduct;
      }
      if (scooterAmount <= 0 || dayRate <= 0) continue;
      const daysCovered = Math.floor(scooterAmount / dayRate);
      const next = new Date(paidThrough);
      next.setDate(next.getDate() + daysCovered);
      paidThrough = next;
    }

    const daysLate = daysOverdue(paidThrough);
    if (daysLate <= 0) {
      return { paidThroughDate: paidThrough, daysLate: 0, rentOwed: 0, penalty: 0, totalDebt: 0 };
    }
    const rentOwed = calculateOwedRent(weeklyPrice, daysLate);
    const debtSince = calculateDebtSince(paidThrough);
    const penalty = calculatePenalty(daysSinceDebt(debtSince), noPenalty);
    return { paidThroughDate: paidThrough, daysLate, rentOwed, penalty, totalDebt: rentOwed + penalty };
  }

  // Повна "бухгалтерська" картина оренди за методикою: нараховуємо оренду
  // за КОЖЕН день періоду оренди (від дати старту підписки до дати
  // повернення скутера, або до сьогодні, якщо він ще в оренді — обидві
  // дати включно) за денною ставкою, віднімаємо суму всіх фактично
  // внесених оплат за скутер (без завдатку й акумулятора — ті самі
  // виключення, що й у recalculateDebtFromHistory) і отримуємо загальний
  // залишок боргу за весь час оренди. Прострочення й пеню беремо з
  // recalculateDebtFromHistory — вони вже рахуються саме так, як описано
  // (дата, по яку реально оплачено, і дні прострочення від неї), тож
  // дублювати цю логіку тут не потрібно: "загальний борг за оренду" і
  // "прострочений борг" — свідомо різні числа (частина нарахованого може
  // ще не бути простроченою).
  export type RentalLedger = {
    periodDays: number;
    accrued: number;
    grossPaid: number;
    depositDeducted: number;
    paid: number;
    remainingDebt: number;
    daysLate: number;
    penalty: number;
  };

  function startOfDay(d: Date): Date {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  export function calculateRentalLedger(
    weeklyPrice: number,
    subscriptionStartDate: string | Date | null,
    returnDate: string | Date | null,
    payments: RecalcPaymentInput[],
    noPenalty = false,
    depositAmount = 0
  ): RentalLedger {
    const dayRate = weeklyPrice / 7;
    const start = subscriptionStartDate ? startOfDay(new Date(subscriptionStartDate)) : null;
    const end = startOfDay(returnDate ? new Date(returnDate) : new Date());

    let periodDays = 0;
    if (start) {
      const diffMs = end.getTime() - start.getTime();
      periodDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1); // обидві дати включно
    }

    const accrued = Math.round(periodDays * dayRate);

    // grossPaid — усе, що курʼєр фактично вніс за скутер (без акумулятора);
    // depositDeducted — стандартний завдаток для міста (getDepositAmount/
    // resolveDeposit), який ми повертаємо курʼєру при здачі скутера, тож він
    // НЕ йде в рахунок орендної плати — показуємо обидва числа окремо, щоб
    // було видно, що саме й чому віднято.
    const grossPaid = payments
      .filter(p => p.status !== "failed" && !isPenaltyPayment(p))
      .reduce((sum, p) => sum + Math.max(0, p.amount - (p.battery_amount || 0)), 0);

    const depositDeducted = Math.min(depositAmount, grossPaid);
    const paid = grossPaid - depositDeducted;

    const remainingDebt = Math.max(0, accrued - paid);

    const { daysLate, penalty } = recalculateDebtFromHistory(weeklyPrice, subscriptionStartDate, payments, noPenalty, depositAmount);

    return { periodDays, accrued, grossPaid, depositDeducted, paid, remainingDebt, daysLate, penalty };
  }

  // Єдине "офіційне" число боргу, яке тепер використовується скрізь у
  // системі (картка кур'єра, готівкова/онлайн оплата, Telegram-бот, cron) —
  // замінює старі totalWithPenalty/calculateAutoDebt-розрахунки, що
  // спирались лише на поточну subscriptions.expires_at і могли
  // розсинхронізуватись із фактичною історією платежів. remainingDebt тут —
  // це borg за орендну плату (Нараховано − Оплачено), а totalOwed додає
  // зверху пеню — саме ця сума має показуватись як "Борг" і саме її мають
  // просити сплатити.
  export type DebtLedger = RentalLedger & {
    paidThroughDate: Date;
    totalOwed: number;
  };

  export function calculateDebtLedger(
    weeklyPrice: number,
    subscriptionStartDate: string | Date | null,
    returnDate: string | Date | null,
    payments: RecalcPaymentInput[],
    noPenalty = false,
    depositAmount = 0
  ): DebtLedger {
    const ledger = calculateRentalLedger(weeklyPrice, subscriptionStartDate, returnDate, payments, noPenalty, depositAmount);
    const { paidThroughDate } = recalculateDebtFromHistory(weeklyPrice, subscriptionStartDate, payments, noPenalty, depositAmount);
    return { ...ledger, paidThroughDate, totalOwed: ledger.remainingDebt + ledger.penalty };
  }
