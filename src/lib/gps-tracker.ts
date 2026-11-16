// Керування GPS-трекером скутера (MT21) по SMS.
//
// Коди підтверджені з офіційної інструкції виробника (розділ "3.1 Vehicle
// oil pump power supply", доступно для MT-1C(1X)/A1X/MT21-22/MT5A-5B):
//   9400000 — Cut vehicle oil pump power supply (блокувати)
//   9410000 — Recover vehicle oil pump power supply (розблокувати)
// Коди з офіційної паперової інструкції (фото), ще не підтверджені
// фізичним тестом на реальному скутері — перевірити вручну з телефону
// перед тим, як покладатись на це в продакшені.
//
// SMS надсилається через SMS Gateway for Android (cloud-режим, sms-gate.app) —
// окремий Android-телефон із власною SIM-карткою, зареєстрованою на трекері
// як дозволений номер (команда CENTER,A,<номер шлюзу>#).
//
// Потрібні змінні середовища:
//   SMS_GATEWAY_LOGIN, SMS_GATEWAY_PASSWORD — Basic Auth з екрану
//   "Cloud Server" застосунку SMS Gateway for Android.
//   SMS_GATEWAY_SIM_NUMBER (необов'язково, за замовчуванням 2) — номер SIM-слота
//   (1-based) на телефоні-шлюзі, з якого слати SMS. На телефоні дві SIM-картки,
//   на першій немає коштів — тому явно вказуємо слот 2, замість покладатись на
//   системні/застосункові налаштування "SIM за замовчуванням" на Android.

const SMS_GATEWAY_URL = "https://api.sms-gate.app/3rdparty/v1/messages";

export type TrackerCommandResult = { ok: boolean; error?: string };

async function sendTrackerSms(simPhone: string, text: string): Promise<TrackerCommandResult> {
  const login = process.env.SMS_GATEWAY_LOGIN;
  const password = process.env.SMS_GATEWAY_PASSWORD;

  if (!login || !password) {
    return { ok: false, error: "SMS_GATEWAY_LOGIN / SMS_GATEWAY_PASSWORD не налаштовані на сервері" };
  }
  if (!simPhone) {
    return { ok: false, error: "У скутера не вказано номер SIM-картки трекера" };
  }

  try {
    const auth = Buffer.from(`${login}:${password}`).toString("base64");
    const res = await fetch(SMS_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`,
      },
      body: JSON.stringify({
        textMessage: { text },
        phoneNumbers: [simPhone],
        simNumber: Number(process.env.SMS_GATEWAY_SIM_NUMBER) || 2,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `SMS Gateway HTTP ${res.status}: ${body.slice(0, 200)}` };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function blockScooterByGps(simPhone: string): Promise<TrackerCommandResult> {
  return sendTrackerSms(simPhone, "9400000");
}

export async function unblockScooterByGps(simPhone: string): Promise<TrackerCommandResult> {
  return sendTrackerSms(simPhone, "9410000");
}
