// Спільна обгортка над Resend, яка ГАРАНТОВАНО не ковтає помилки мовчки.
//
// Клієнт Resend НЕ кидає виняток при помилці на рівні API (наприклад,
// невалідна адреса відправника, перевищений ліміт, заблокований домен) —
// він повертає її в полі `error` результату. Кілька місць у коді раніше
// робили просто `await resend.emails.send(...)` всередині try/catch, який
// ніколи не спрацьовував для таких помилок, тож лист міг не піти зовсім,
// а код продовжував працювати так, ніби все відправилось успішно.
import { Resend } from "resend";
import type { CreateEmailOptions, CreateEmailRequestOptions } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmailChecked(
  payload: CreateEmailOptions,
  options?: CreateEmailRequestOptions
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const { error } = await resend.emails.send(payload, options);
    if (error) {
      console.error("sendEmailChecked: Resend rejected the email", error, "to:", payload.to);
      return { ok: false, error: error.message || "Resend rejected the email" };
    }
    return { ok: true, error: null };
  } catch (e) {
    console.error("sendEmailChecked: send threw", e, "to:", payload.to);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
