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
  'січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
  'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень',
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^а-яіїє�ѕ/gi, '');
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

const SUMMARY_ROW_PATTERN = /^(всього|разом|итого|сума|total)\b/i;

export function parseDebtorsFromSheet(city: string, rows: string[][]): SheetDebtor[] {
  if (rows.length === 0) return [];
  const headerIdx = findHeaderRowIndex(rows);
  const header = rows[headerIdx];

  const nameCol = findColumnIndex(header, /фамілія/i);
  const phoneCol = findColumnIndex(header, /телефон/i);
  const debtCol = findColumnIndex(header, /борг<завдаток/i);

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
