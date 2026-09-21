// Приводимо номер телефону до єдиного формату +380XXXXXXXXX.
//
// Раніше майже скрізь у коді нормалізація була наївною: "додати + якщо його
// немає". Це ламалось, коли курʼєр вводив номер у звичному локальному
// форматі з 0 (наприклад "0678805016") — результат виходив "+0678805016",
// що не збігається з жодним записом у базі і не є валідним номером для SMS.
// Через це створювались дублікати кур'єрів (реєстрація не знаходила
// існуючий запис за нормальним номером) і SMS-коди йшли в нікуди.
export function normalizePhone(raw: string): string {
  const cleaned = (raw || "").trim().replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+380")) return cleaned;
  if (cleaned.startsWith("380")) return "+" + cleaned;
  if (cleaned.startsWith("0") && cleaned.length === 10) return "+380" + cleaned.slice(1);
  if (cleaned.startsWith("+")) return cleaned;
  return "+" + cleaned;
}
