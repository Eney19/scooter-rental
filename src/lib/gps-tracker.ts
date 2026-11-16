// Керування GPS-трекером скутера (MT21 / GT06-сумісний протокол) по SMS.
//
// Команди (RELAY,1# — вимкнути живлення/блокувати, RELAY,0# — відновити)
// відповідають протоколу GT06/GT06N, до якого, судячи з маркування проводів
// (Red=VCC, Black=GND, Orange=ACC, Yellow=Cut Oil), належить наш трекер MT21.
// ПОКИ НЕ ПІДТВЕРДЖЕНО на реальному пристрої — перевірено вручну з телефону,
// перш ніж покладатись на це в продакшені.
//
// SMS надсилається через SMS Gateway for Android (cloud-режим, sms-gate.app) —
// окремий Android-телефон із власною SIM-карткою, зареєстрованою на трекері
// як дозволений номер (команда CENTER,A,<номер шлюзу>#).
//
// Потрібні змінні середовища:
//   SMS_GATEWAY_LOGIN, SMS_GATEWAY_PASSWORD — Basic Auth з екрану
//   "Cloud Server" застосунку SMS Gateway for Android.

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
  return sendTrackerSms(simPhone, "RELAY,1#");
}

export async function unblockScooterByGps(simPhone: string): Promise<TrackerCommandResult> {
  return sendTrackerSms(simPhone, "RELAY,0#");
}
