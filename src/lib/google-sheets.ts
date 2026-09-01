import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY не задані');
  }
  const privateKey = rawKey.replace(/\\n/g, '\n');
  return new google.auth.JWT({ email, key: privateKey, scopes: SCOPES });
}

let sheetsClient: ReturnType<typeof google.sheets> | null = null;
function getClient() {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: 'v4', auth: getAuth() });
  }
  return sheetsClient;
}

/** Список назв усіх листів у книзі, у порядку як вони йдуть у Google Sheets */
export async function getSheetTitles(spreadsheetId: string): Promise<string[]> {
  const sheets = getClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  return (meta.data.sheets || [])
    .map((s) => s.properties?.title || '')
    .filter(Boolean);
}

/** Всі значення листа як масив рядків (кожен рядок — масив клітинок) */
export async function getSheetValues(
  spreadsheetId: string,
  sheetTitle: string
): Promise<string[][]> {
  const sheets = getClient();
  const range = `'${sheetTitle}'!A1:Z1000`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values as string[][]) || [];
}
