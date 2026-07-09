import { getSheetTitles, getSheetValues } from './google-sheets';

export interface CityConfig {
  city: string;
  spreadsheetId: string;
}

export interface Debtor {
  city: string;
  name: string;
  phone: string;
  debt: number;
  source: 'sheet' | 'app';
}

const UA_MONTHS = [
  'січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
  'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень',
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^а-яіїєґ]/gi, '');
}

/**
 * Знаходить лист поточного місяця у книзі.
 * Назви листів у різних містах не уніфіковані ("Липень", "Липень 2026", "Липень."),
 * тому шукаємо нечітким збігом: нормалізована назва має починатись з назви місяця.
 * Якщо є кілька збігів (наприклад лист за минулий рік і за цей), пріоритет —
 * тому, що містить поточний рік; інакше беремо останній за порядком у книзі
 * (Google Sheets листи зазвичай додають в кінець хронологічно).
 * Якщо збігів по поточному місяцю немає взагалі (лист ще не створили),
 * фолбек — останній лист у книзі, назва якого схожа на будь-який місяць.
 */
export function resolveCurrentSheetTitle(titles: string[], now = new Date()): string | null {
  const monthName = UA_MONTHS[now.getMonth()];
  const year = String(now.getFullYear());

  const monthMatches = titles.filter((t) => normalize(t).startsWith(monthName));
  if (monthMatches.length > 0) {
    const withYear = monthMatches.filter((t) => t.includes(year));
    if (withYear.length > 0) return withYear[withYear.length - 1];
    return monthMatches[monthMatches.length - 1];
  }

  // фолбек: лист місяця ще не створено -> беремо найостанніший місячний лист у книзі
  const anyMonthMatches = titles.filter((t) => UA_MONTHS.some((m) => normalize(t).startsWith(m)));
  return anyMonthMatches.length > 0 ? anyMonthMatches[anyMonthMatches.length - 1] : null;
}

function findHeaderRowIndex(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    if (rows[i].some((cell) => /фамілія/i.test(String(cell || '')))) return i;
  }
  return 0;
}

function findColumnIndex(header: string[], pattern: RegExp): number {
  return header.findIndex((cell) => pattern.test(String(cell || '')));
}

function parseAmount(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return 0;
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Парсить один аркуш і повертає список боржників (борг > 0) */
export function parseDebtorsFromSheet(city: string, rows: string[][]): Debtor[] {
  if (rows.length === 0) return [];
  const headerIdx = findHeaderRowIndex(rows);
  const header = rows[headerIdx];

  const nameCol = findColumnIndex(header, /фамілія/i);
  const phoneCol = findColumnIndex(header, /телефон/i);
  const debtCol = findColumnIndex(header, /борг|завдаток/i);

  if (nameCol === -1 || debtCol === -1) return [];

  const SUMMARY_ROW_PATTERN = /^(всього|разом|итого|сума|total)\b/i;

  const debtors: Debtor[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const name = (row[nameCol] || '').toString().trim();
    if (!name || SUMMARY_ROW_PATTERN.test(name)) continue;

    const debt = parseAmount(row[debtCol]);
    if (debt > 0) {
      debtors.push({
        city,
        name,
        phone: phoneCol !== -1 ? (row[phoneCol] || '').toString().trim() : '',
        debt,
        source: 'sheet',
      });
    }
  }
  return debtors;
}

/** Тягне дані по всіх містах і повертає повний список боржників */
export async function collectAllDebtors(cities: CityConfig[]): Promise<Debtor[]> {
  const all: Debtor[] = [];
  for (const { city, spreadsheetId } of cities) {
    const titles = await getSheetTitles(spreadsheetId);
    const sheetTitle = resolveCurrentSheetTitle(titles);
    if (!sheetTitle) continue;

    const rows = await getSheetValues(spreadsheetId, sheetTitle);
    all.push(...parseDebtorsFromSheet(city, rows));
  }
  return all.sort((a, b) => b.debt - a.debt);
}

export function formatDebtorsMessage(debtors: Debtor[]): string {
  if (debtors.length === 0) {
    return '✅ *PowerDrive — звіт по боржниках*\nБоржників на сьогодні немає.';
  }

  const byCity = new Map<string, Debtor[]>();
  for (const d of debtors) {
    if (!byCity.has(d.city)) byCity.set(d.city, []);
    byCity.get(d.city)!.push(d);
  }

  const lines: string[] = [`📋 *PowerDrive — боржники на ${new Date().toLocaleDateString('uk-UA')}*`, ''];
  let grandTotal = 0;

  for (const [city, list] of byCity) {
    const cityTotal = list.reduce((sum, d) => sum + d.debt, 0);
    grandTotal += cityTotal;
    lines.push(`*${city}* (${list.length} чол., ${cityTotal.toLocaleString('uk-UA')} грн)`);
    for (const d of list) {
      const phone = d.phone ? ` — ${d.phone}` : '';
      const sourceLabel = d.source === 'app' ? ' [застосунок]' : ' [таблиця]';
      lines.push(`  • ${d.name}${phone}: ${d.debt.toLocaleString('uk-UA')} грн${sourceLabel}`);
    }
    lines.push('');
  }

  lines.push(`*Разом: ${grandTotal.toLocaleString('uk-UA')} грн, ${debtors.length} боржників*`);
  return lines.join('\n');
}
