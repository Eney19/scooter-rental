import { getSheetTitles, getSheetValues } from './google-sheets';

export interface CityConfig {
  city: string;
  spreadsheetId: string;
}

export interface SheetDebtor {
  city: string;
  name: string;
  phone: string;
  debt: number;
}

const UA_MONTHS = [
  '\u0441\u0456\u0447\u0435\u043D\u044C',
  '\u043B\u044E\u0442\u0438\u0439',
  '\u0431\u0435\u0440\u0435\u0437\u0435\u043D\u044C',
  '\u043A\u0432\u0456\u0442\u0435\u043D\u044C',
  '\u0442\u0440\u0430\u0432\u0435\u043D\u044C',
  '\u0447\u0435\u0440\u0432\u0435\u043D\u044C',
  '\u043B\u0438\u043F\u0435\u043D\u044C',
  '\u0441\u0435\u0440\u043F\u0435\u043D\u044C',
  '\u0432\u0435\u0440\u0435\u0441\u0435\u043D\u044C',
  '\u0436\u043E\u0432\u0442\u0435\u043D\u044C',
  '\u043B\u0438\u0441\u0442\u043E\u043F\u0430\u0434',
  '\u0433\u0440\u0443\u0434\u0435\u043D\u044C',
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\u0430-\u044F\u0456\u0457\u0454\u0491]/gi, '');
}

export function resolveCurrentSheetTitle(titles: string[], now = new Date()): string | null {
  const monthName = UA_MONTHS[now.getMonth()];
  const year = String(now.getFullYear());

  const monthMatches = titles.filter((t) => normalize(t).startsWith(monthName));
  if (monthMatches.length > 0) {
    const withYear = monthMatches.filter((t) => t.includes(year));
    if (withYear.length > 0) return withYear[withYear.length - 1];
    return monthMatches[monthMatches.length - 1];
  }

  const anyMonthMatches = titles.filter((t) => UA_MONTHS.some((m) => normalize(t).startsWith(m)));
  return anyMonthMatches.length > 0 ? anyMonthMatches[anyMonthMatches.length - 1] : null;
}

function findHeaderRowIndex(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    if (rows[i].some((cell) => /\u0444\u0430\u043C\u0456\u043B\u0456\u044F/i.test(String(cell || '')))) return i;
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

const SUMMARY_ROW_PATTERN = /^(\u0432\u0441\u044C\u043E\u0433\u043E|\u0440\u0430\u0437\u043E\u043C|\u0438\u0442\u043E\u0433\u043E|\u0441\u0443\u043C\u0430)\b/i;

export function parseDebtorsFromSheet(city: string, rows: string[][]): SheetDebtor[] {
  if (rows.length === 0) return [];
  const headerIdx = findHeaderRowIndex(rows);
  const header = rows[headerIdx];

  const nameCol = findColumnIndex(header, /\u0444\u0430\u043C\u0456\u043B\u0456\u044F/i);
  const phoneCol = findColumnIndex(header, /\u0442\u0435\u043B\u0435\u0444\u043E\u043D/i);
  const debtCol = findColumnIndex(header, /\u0431\u043E\u0440\u0433|\u0437\u0430\u0432\u0434\u0430\u0442\u043E\u043A/i);

  if (nameCol === -1 || debtCol === -1) return [];

  const debtors: SheetDebtor[] = [];
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
      });
    }
  }
  return debtors;
}

export async function collectSheetDebtors(cities: CityConfig[]): Promise<SheetDebtor[]> {
  const all: SheetDebtor[] = [];
  for (const { city, spreadsheetId } of cities) {
    const titles = await getSheetTitles(spreadsheetId);
    const sheetTitle = resolveCurrentSheetTitle(titles);
    if (!sheetTitle) continue;

    const rows = await getSheetValues(spreadsheetId, sheetTitle);
    all.push(...parseDebtorsFromSheet(city, rows));
  }
  return all.sort((a, b) => b.debt - a.debt);
}
