"use client";
import { useState, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import SignaturePad from "signature_pad";

type Step = 1 | 2 | 3;
type FormState = {
  fullName: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  taxId: string;
  passport: string;
  weeklyPrice: string;
  scooterModel: string;
};

const init: FormState = {
  fullName: "", phone: "+380", email: "",
  city: "Луцьк", address: "", taxId: "", passport: "",
  weeklyPrice: "2400", scooterModel: "FADA Flit II"
};

const CONTRACT_URL = "https://jaenpkdnhlcpyyzwlqui.supabase.co/storage/v1/object/public/templates/contract-template.pdf";
const PRIVACY_URL = "/privacy-policy";
const WEEKLY_PRICES = ["1750", "2100", "2400", "2800"];
const SCOOTER_MODELS = ["FADA Flit II", "Aima u1s", "Dominator A-9", "Crosser CR 21 Tank"];

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(init);
  const [courierId, setCourierId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smsCode, setSmsCode] = useState("");
  const [smsError, setSmsError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const [contractPdfUrl, setContractPdfUrl] = useState<string | null>(null);
  const [cashRequested, setCashRequested] = useState(false);
  const [cashLoading, setCashLoading] = useState(false);
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [propyskaFile, setPropyskaFile] = useState<File | null>(null);
  const [rnokppFile, setRnokppFile] = useState<File | null>(null);
  const [consentPd, setConsentPd] = useState(false);
  const [consentContract, setConsentContract] = useState(false);
  const [customPrice, setCustomPrice] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(p => ({ ...p, [k]: v }));
    setError(null);
  }

  async function handleStep1(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!consentPd) {
      setError("Будь ласка, надайте згоду на обробку персональних даних"); return;
    }
    if (!consentContract) {
      setError("Будь ласка, підтвердіть ознайомлення з умовами договору"); return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from("couriers")
      .insert({ full_name: form.fullName.trim(), phone: form.phone.trim(), email: form.email.trim() || null })
      .select("id")
      .single();
    setLoading(false);
    if (err) {
      if (err.code === "23505") {
        setError("Цей номер телефону вже зареєстрований.");
      } else {
        setError("Помилка реєстрації. Спробуйте ще раз.");
      }
      return;
    }
    setCourierId(data.id);
    setStep(2);
  }

  async function handleStep2(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.address.trim() || !form.taxId.trim() || !form.passport.trim()) {
      setError("Будь ласка, заповніть адресу, РНОКПП та паспортні дані"); return;
    }
    if (!passportFile || !propyskaFile || !rnokppFile) {
      setError("Будь ласка, завантажте всі документи"); return;
    }
    setLoading(true);
    const uploadFile = async (file: File, name: string) => {
      const ext = (file.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "");
      const path = `${courierId}/${name}.${ext}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from("documents")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      return path;
    };
    try {
      await uploadFile(passportFile, "passport");
      await uploadFile(propyskaFile, "propiska");
      await uploadFile(rnokppFile, "rnokpp");
      const finalPrice = customPrice || form.weeklyPrice;
      
      await supabase.from("couriers").update({
        city: form.city,
        address: form.address.trim(),
        tax_id: form.taxId.trim(),
        passport: form.passport.trim(),
        weekly_price: parseInt(finalPrice),
        scooter_model: form.scooterModel,
      }).eq("id", courierId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Помилка завантаження");
      setLoading(false);
      return;
    }
    setLoading(false);
    setStep(3);
    setTimeout(() => {
      if (canvasRef.current) sigPadRef.current = new SignaturePad(canvasRef.current);
    }, 300);
  }

  async function sendSmsCode() {
    setLoading(true);
    await fetch("/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: form.phone })
    });
    setLoading(false);
    alert("SMS надіслано на " + form.phone);
  }

  async function handleSign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      setSmsError("Будь ласка, поставте підпис"); return;
    }
    if (!smsCode || smsCode.length < 4) {
      setSmsError("Введіть код з SMS"); return;
    }
    setLoading(true);

    const verifyRes = await fetch("/api/verify-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: form.phone, code: smsCode, courierId })
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success) {
      setSmsError("Невірний код. Спробуйте ще раз");
      setLoading(false);
      return;
    }

    const signatureDataUrl = sigPadRef.current.toDataURL("image/png");
    const finalPrice = customPrice || form.weeklyPrice;
    const signRes = await fetch("/api/sign-contract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courierName: form.fullName,
        courierPhone: form.phone,
        courierEmail: form.email,
        taxId: form.taxId,
        passport: form.passport,
        address: form.address,
        city: form.city,
        weeklyPrice: finalPrice,
        scooterModel: form.scooterModel,
        signatureDataUrl,
        courierId,
      })
    });
    const signData = await signRes.json();
    setLoading(false);

    if (!signData.success) {
      setSmsError(signData.error || "Помилка підписання. Спробуйте ще раз");
      return;
    }

    setContractPdfUrl(signData.pdfUrl || null);
    setSigned(true);
  }

  async function handleCashPayment() {
    setCashLoading(true);
    try {
      const res = await fetch("/api/cash-payment-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierId }),
      });
      const data = await res.json();
      if (data.success) {
        setCashRequested(true);
      }
    } finally {
      setCashLoading(false);
    }
  }

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "powerdrive_scooter_bot";

  const inp = "w-full rounded-xl border border-slate-200 px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-slate-900";
  const lbl = "block text-sm font-medium text-slate-700 mb-1";

  const FileUpload = ({ label, file, onChange }: {
    label: string; file: File | null; onChange: (f: File) => void;
  }) => (
    <div>
      <label className={lbl}>{label} *</label>
      <label className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all ${file ? "border-green-400 bg-green-50" : "border-blue-200 bg-slate-50 hover:bg-blue-50"}`}>
        <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => e.target.files?.[0] && onChange(e.target.files[0])} />
        {file ? (
          <div className="text-center px-2">
            <div className="text-xl mb-1">✅</div>
            <p className="text-xs text-green-700 font-medium truncate max-w-xs">{file.name}</p>
            <p className="text-xs text-green-500">Натисніть щоб змінити</p>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-2xl mb-1">📎</div>
            <p className="text-xs text-slate-500">Натисніть щоб завантажити фото або PDF</p>
          </div>
        )}
      </label>
    </div>
  );

  if (signed && cashRequested) return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">⏳</div>
        <h1 className="text-2xl font-bold text-slate-900">Очікуємо підтвердження оплати</h1>
        <p className="text-slate-500 mt-2 mb-4">
          Адміністратора сповіщено. Щойно він підтвердить отримання готівки — ваша підписка активується автоматично.
        </p>
        {botUsername && (
          <a
            href={`https://t.me/${botUsername}`}
            target="_blank"
            className="inline-block bg-blue-500 text-white rounded-xl px-6 py-3 font-semibold hover:bg-blue-600"
          >
            💬 Приєднатися до Telegram-бота
          </a>
        )}
        <p className="text-slate-400 text-xs mt-3">У боті ви отримаєте підтвердження та нагадування про наступні оплати.</p>
      </div>
    </div>
  );

  if (signed) return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
        <h1 className="text-2xl font-bold text-slate-900">Договір підписано!</h1>
        <p className="text-slate-500 mt-2 mb-4">Копію договору надіслано на ваш email. Оберіть спосіб оплати:</p>
        {contractPdfUrl && (
          <a href={contractPdfUrl} target="_blank" className="inline-block bg-blue-600 text-white rounded-xl px-6 py-3 font-semibold hover:bg-blue-700 mb-3">
            📄 Завантажити договір PDF
          </a>
        )}
       <button
          onClick={() => router.push(`/payment/${courierId}`)}
          className="w-full mt-3 bg-green-600 text-white rounded-xl py-4 text-lg font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
        >
          <span>💳</span>
          <span>Оплатити онлайн</span>
        </button>
        <button
          onClick={handleCashPayment}
          disabled={cashLoading}
          className="w-full mt-3 border-2 border-slate-200 text-slate-700 rounded-xl py-4 text-lg font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <span>💵</span>
          <span>{cashLoading ? "Надсилаємо..." : "Оплата готівкою на місці"}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white px-4 py-8">
      <div className="max-w-md mx-auto">

        <div className="flex items-center justify-center mb-8 gap-2">
          {[1,2,3].map(s => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${step >= s ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-400"}`}>{s}</div>
              {s < 3 && <div className={`w-12 h-1 mx-1 rounded ${step > s ? "bg-blue-600" : "bg-slate-200"}`}/>}
            </div>
          ))}
        </div>

        {step === 1 && (
          <form onSubmit={handleStep1} className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
            <h1 className="text-2xl font-bold text-slate-900 text-center">Реєстрація</h1>
            <p className="text-slate-500 text-center text-sm">Крок 1 з 3 — Основні дані</p>
            <div><label className={lbl}>ПІБ *</label>
              <input type="text" required value={form.fullName} onChange={e=>set("fullName",e.target.value)} className={inp} placeholder="Іванов Іван Іванович"/>
            </div>
            <div><label className={lbl}>Номер телефону *</label>
              <input type="tel" required value={form.phone} onChange={e=>set("phone",e.target.value)} className={inp} placeholder="+380501234567"/>
            </div>
            <div><label className={lbl}>Email</label>
              <input type="email" value={form.email} onChange={e=>set("email",e.target.value)} className={inp} placeholder="email@example.com"/>
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={consentPd}
                  onChange={e => setConsentPd(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-sm text-slate-600">
                  Я даю згоду на обробку моїх персональних даних відповідно до{" "}
                  <a href={PRIVACY_URL} target="_blank" className="text-blue-600 underline hover:text-blue-700">
                    Політики конфіденційності
                  </a>{" "}
                  згідно із Законом України «Про захист персональних даних» *
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={consentContract}
                  onChange={e => setConsentContract(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-sm text-slate-600">
                  Я ознайомився з{" "}
                  <a href={CONTRACT_URL} target="_blank" className="text-blue-600 underline hover:text-blue-700">
                    умовами договору прокату
                  </a>{" "}
                  та погоджуюсь з ними *
                </span>
              </label>
              <p className="text-xs text-slate-400 pt-1">
                <a href="/terms-and-conditions" target="_blank" className="underline hover:text-slate-600">Умови надання послуг</a>
                {" · "}
                <a href="/refund-policy" target="_blank" className="underline hover:text-slate-600">Повернення коштів</a>
                {" · "}
                <a href="/contacts" target="_blank" className="underline hover:text-slate-600">Контакти</a>
              </p>
            </div>

            {error && <p className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-semibold hover:bg-blue-700 disabled:opacity-60">
              {loading ? "Збереження..." : "Далі →"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleStep2} className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
            <h1 className="text-2xl font-bold text-slate-900 text-center">Документи</h1>
            <p className="text-slate-500 text-center text-sm">Крок 2 з 3 — Дані та фото</p>
            <div><label className={lbl}>Місто *</label>
              <select required value={form.city} onChange={e=>set("city",e.target.value)} className={inp}>
                {["Луцьк","Рівне","Львів"].map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label className={lbl}>Адреса проживання *</label>
              <input type="text" required value={form.address} onChange={e=>set("address",e.target.value)} className={inp} placeholder="Волинська обл., м. Луцьк, вул. Шевченка, 1, кв. 10"/>
            </div>
            <div><label className={lbl}>РНОКПП *</label>
              <input type="text" required maxLength={10} value={form.taxId} onChange={e=>set("taxId",e.target.value.replace(/\D/g,"").slice(0,10))} className={inp} placeholder="1234567890"/>
            </div>
            <div><label className={lbl}>Серія та номер паспорту *</label>
              <input type="text" required value={form.passport} onChange={e=>set("passport",e.target.value)} className={inp} placeholder="АА 123456"/>
            </div>
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div><label className={lbl}>Вартість на тиждень *</label>
                <select value={form.weeklyPrice} onChange={e=>set("weeklyPrice",e.target.value)} className={inp}>
                  <option value="1750">1750 грн</option>
                  <option value="2100">2100 грн</option>
                  <option value="2400">2400 грн</option>
                  <option value="2800">2800 грн</option>
                  <option value="">інше</option>
                </select>
                {form.weeklyPrice === "" && (
                  <input type="number" min="1000" max="10000" value={customPrice} onChange={e=>setCustomPrice(e.target.value)} className={`${inp} mt-2`} placeholder="Введіть суму"/>
                )}
              </div>
              <div><label className={lbl}>Модель скутера *</label>
                <select value={form.scooterModel} onChange={e=>set("scooterModel",e.target.value)} className={inp}>
                  {SCOOTER_MODELS.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm font-medium text-slate-700 mb-3">📎 Фото документів</p>
              <div className="space-y-3">
                <FileUpload label="Фото паспорту ID" file={passportFile} onChange={setPassportFile}/>
                <FileUpload label="Витяг про місце проживання" file={propyskaFile} onChange={setPropyskaFile}/>
                <FileUpload label="Картка платника податків (РНОКПП)" file={rnokppFile} onChange={setRnokppFile}/>
              </div>
            </div>
            {error && <p className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={()=>setStep(1)} className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-3 font-medium hover:bg-slate-50">← Назад</button>
              <button type="submit" disabled={loading} className="flex-grow bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 disabled:opacity-60">
                {loading ? "Завантаження..." : "Далі →"}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleSign} className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
            <h1 className="text-2xl font-bold text-slate-900 text-center">Підписання договору</h1>
            <p className="text-slate-500 text-center text-sm">Крок 3 з 3 — Підпис</p>
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Ознайомтесь з договором:</p>
              <iframe src={CONTRACT_URL} className="w-full h-80 rounded-xl border border-slate-200" title="Договір прокату"/>
              <p className="mt-2 text-xs text-slate-500">Наймач: <strong>{form.fullName}</strong> | РНОКПП: <strong>{form.taxId}</strong> | Паспорт: <strong>{form.passport}</strong></p>
            </div>
            <div>
              <label className={lbl}>Ваш підпис *</label>
              <canvas ref={canvasRef} width={370} height={150} className="w-full border-2 border-dashed border-blue-200 rounded-xl bg-slate-50 touch-none"/>
              <button type="button" onClick={()=>sigPadRef.current?.clear()} className="text-xs text-slate-400 mt-1 hover:text-slate-600">Очистити підпис</button>
            </div>
            <div>
              <label className={lbl}>SMS підтвердження</label>
              <div className="flex gap-2">
                <input type="text" maxLength={6} value={smsCode} onChange={e=>setSmsCode(e.target.value.replace(/\D/g,""))} className={inp} placeholder="6-значний код"/>
                <button type="button" onClick={sendSmsCode} disabled={loading} className="px-4 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 whitespace-nowrap">Отримати SMS</button>
              </div>
            </div>
            {smsError && <p className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">{smsError}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={()=>setStep(2)} className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-3 font-medium hover:bg-slate-50">← Назад</button>
              <button type="submit" disabled={loading} className="flex-grow bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 disabled:opacity-60">
                {loading ? "Підписання..." : "Підписати договір ✓"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
