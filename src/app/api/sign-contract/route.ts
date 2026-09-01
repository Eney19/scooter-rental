import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase";

// За замовчуванням на Hobby-тарифі Vercel функція обривається через 10с — цього
// не вистачає на генерацію PDF (кілька fetch-запитів + рендеринг) і заливку в Storage.
// 60с — максимум, доступний на Hobby.
export const maxDuration = 60;

const resend = new Resend(process.env.RESEND_API_KEY);
const FOP_EMAIL = "anteyfgh41@gmail.com";

const FOP_DATA = {
  name: "ФОП Щурук Андрій Ярославович",
  iban: "UA653220010000026009330175849",
  mfo: "322001",
};

const RETURN_ADDRESSES: Record<string, string> = {
  "Луцьк": "вул Привокзальна 20 Є",
  "Рівне": "вул Андрія Мельника, 2",
  "Львів": "вул Єрошенка, 19",
};

const DEPOSIT_AMOUNT = "2100";

function topY(top: number, pageHeight: number) {
  return pageHeight - top;
}

function generateContractNumber(city: string, courierId: string) {
  const cityAbbrev = city === "Луцьк" ? "LT" : city === "Рівне" ? "RV" : "LV";
  const year = new Date().getFullYear();
  const seq = courierId.slice(-3).padStart(3, "0");
  return `${cityAbbrev}-${year}-${seq}`;
}

// Повний переклад числа у слова (українською), з правильним узгодженням "тисяча/тисячі/тисяч"
function numberToWords(num: number): string {
  const ones = ["", "один", "два", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять"];
  const onesFeminine = ["", "одна", "дві", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять"];
  const teens = ["десять", "одинадцять", "дванадцять", "тринадцять", "чотирнадцять", "п'ятнадцять", "шістнадцять", "сімнадцять", "вісімнадцять", "дев'ятнадцять"];
  const tens = ["", "", "двадцять", "тридцять", "сорок", "п'ятдесят", "шістдесят", "сімдесят", "вісімдесят", "дев'яносто"];
  const hundreds = ["", "сто", "двісті", "триста", "чотириста", "п'ятсот", "шістсот", "сімсот", "вісімсот", "дев'ятсот"];

  function threeDigits(n: number, useFeminine: boolean): string {
    const parts: string[] = [];
    const h = Math.floor(n / 100);
    const rem = n % 100;
    if (h > 0) parts.push(hundreds[h]);
    if (rem >= 10 && rem < 20) {
      parts.push(teens[rem - 10]);
    } else {
      const t = Math.floor(rem / 10);
      const o = rem % 10;
      if (t > 0) parts.push(tens[t]);
      if (o > 0) parts.push(useFeminine ? onesFeminine[o] : ones[o]);
    }
    return parts.join(" ");
  }

  function thousandWord(n: number): string {
    const lastTwo = n % 100;
    const last = n % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return "тисяч";
    if (last === 1) return "тисяча";
    if (last >= 2 && last <= 4) return "тисячі";
    return "тисяч";
  }

  if (num === 0) return "нуль";

  const thousands = Math.floor(num / 1000);
  const rest = num % 1000;

  const parts: string[] = [];
  if (thousands > 0) {
    parts.push(threeDigits(thousands, true));
    parts.push(thousandWord(thousands));
  }
  if (rest > 0) {
    parts.push(threeDigits(rest, false));
  }
  return parts.join(" ").trim();
}

export async function POST(req: NextRequest) {
  try {
    const { courierName, courierPhone, courierEmail, taxId, passport, address, city, weeklyPrice, scooterModel, signatureDataUrl, courierId } = await req.json();

    console.log("sign-contract START", city, scooterModel);

    const templateFileMap: Record<string, string> = {
      "Луцьк": "contract-template-lutsk.pdf",
      "Рівне": "contract-template-rivne.pdf",
      "Львів": "contract-template-lviv.pdf",
    };
    const templateFile = templateFileMap[city] || "contract-template-lutsk.pdf";

    const templateRes = await fetch("https://jaenpkdnhlcpyyzwlqui.supabase.co/storage/v1/object/public/templates/" + templateFile);
    if (!templateRes.ok) throw new Error("Template not found");
    const templateBytes = await templateRes.arrayBuffer();

    const pdfDoc = await PDFDocument.load(templateBytes);
    pdfDoc.registerFontkit(fontkit);
    const pages = pdfDoc.getPages();

    const fontRes = await fetch("https://jaenpkdnhlcpyyzwlqui.supabase.co/storage/v1/object/public/templates/Ubuntu-Regular.ttf");
    const fontBytes = await fontRes.arrayBuffer();
    const font = await pdfDoc.embedFont(fontBytes);

    const now = new Date();
    const day = now.getDate().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const year = now.getFullYear().toString();
    const dateStr = now.toLocaleDateString("uk-UA");

    const contractNumber = generateContractNumber(city, courierId);
    const price = weeklyPrice || "2400";
    const priceWords = numberToWords(parseInt(price));
    const returnAddr = RETURN_ADDRESSES[city] || "";

    const FS = 10;

    const page1 = pages[0];
    const h1 = page1.getSize().height;

    page1.drawText(contractNumber, { x: 390, y: topY(46, h1), size: FS, font, color: rgb(0,0,0) });
    page1.drawText(day, { x: 410, y: topY(91, h1), size: FS, font, color: rgb(0,0,0) });
    page1.drawText(month, { x: 445, y: topY(91, h1), size: FS, font, color: rgb(0,0,0) });
    page1.drawText(courierName, { x: 230, y: topY(180, h1), size: FS, font, color: rgb(0,0,0) });
    page1.drawText(passport, { x: 90, y: topY(210, h1), size: FS, font, color: rgb(0,0,0) });
    page1.drawText(scooterModel, { x: 385, y: topY(285, h1), size: 8, font, color: rgb(0,0,0) });
    page1.drawText(price, { x: 458, y: topY(493, h1), size: FS, font, color: rgb(0,0,0) });
    page1.drawText(priceWords + " гривень", { x: 90, y: topY(508, h1), size: FS, font, color: rgb(0,0,0) });

    const pageReq = pages[pages.length - 2];
    const hR = pageReq.getSize().height;

    // Ім'я Наймача під заголовком "ФІЗИЧНА ОСОБА" (симетрично до назви ФОП зліва)
    pageReq.drawText(courierName, { x: 322, y: topY(462, hR), size: 9, font, color: rgb(0,0,0) });

    const fullAddr = address;
    const addrWords = fullAddr.split(" ");
    let line1 = "", line2 = "";
    for (const w of addrWords) {
      if ((line1 + " " + w).trim().length <= 24) {
        line1 = (line1 + " " + w).trim();
      } else {
        line2 = (line2 + " " + w).trim();
      }
    }
    pageReq.drawText(line1, { x: 365, y: topY(489, hR), size: 9, font, color: rgb(0,0,0) });
    pageReq.drawText(line2, { x: 322, y: topY(503, hR), size: 9, font, color: rgb(0,0,0) });
    pageReq.drawText(taxId, { x: 440, y: topY(517, hR), size: FS, font, color: rgb(0,0,0) });
    pageReq.drawText(passport, { x: 440, y: topY(531, hR), size: FS, font, color: rgb(0,0,0) });
    pageReq.drawText(courierPhone, { x: 413, y: topY(545, hR), size: FS, font, color: rgb(0,0,0) });

    const courierSigBase64 = signatureDataUrl.replace(/^data:image\/png;base64,/, "");
    const courierSigBytes = Buffer.from(courierSigBase64, "base64");
    const courierSigImage = await pdfDoc.embedPng(courierSigBytes);
    pageReq.drawImage(courierSigImage, { x: 322, y: topY(575, hR), width: 85, height: 26 });
    pageReq.drawText(courierName, { x: 400, y: topY(566, hR), size: 8, font, color: rgb(0,0,0) });

    let fopSigImage2: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
    try {
      const fopSigRes = await fetch("https://jaenpkdnhlcpyyzwlqui.supabase.co/storage/v1/object/public/templates/signature-fop.png");
      if (fopSigRes.ok) {
        const fopSigBytes = await fopSigRes.arrayBuffer();
        const fopSigImage = await pdfDoc.embedPng(new Uint8Array(fopSigBytes));
        pageReq.drawImage(fopSigImage, { x: 90, y: topY(575, hR), width: 85, height: 26 });
        fopSigImage2 = fopSigImage;
      }
    } catch (e) {
      console.log("FOP signature not found on requisites page");
    }

    const pageAct = pages[pages.length - 1];
    const hA = pageAct.getSize().height;

    pageAct.drawText(contractNumber, { x: 224, y: topY(75.5, hA), size: 7, font, color: rgb(0,0,0) });
    pageAct.drawText(day, { x: 292, y: topY(74, hA), size: 8, font, color: rgb(0,0,0) });
    pageAct.drawText(month, { x: 322, y: topY(74, hA), size: 8, font, color: rgb(0,0,0) });
    pageAct.drawText(day, { x: 413, y: topY(101, hA), size: FS, font, color: rgb(0,0,0) });
    pageAct.drawText(month, { x: 460, y: topY(101, hA), size: FS, font, color: rgb(0,0,0) });
    pageAct.drawText(contractNumber, { x: 102, y: topY(142, hA), size: 6, font, color: rgb(0,0,0) });
    pageAct.drawText(day, { x: 163, y: topY(142, hA), size: 8, font, color: rgb(0,0,0) });
    pageAct.drawText(month, { x: 198, y: topY(142, hA), size: 8, font, color: rgb(0,0,0) });
    pageAct.drawText(courierName, { x: 265, y: topY(184, hA), size: FS, font, color: rgb(0,0,0) });
    pageAct.drawText(scooterModel, { x: 168, y: topY(273, hA), size: FS, font, color: rgb(0,0,0) });

    // "без номеру" замість поля VIN
    pageAct.drawText("без номеру", { x: 258, y: topY(289, hA), size: 9, font, color: rgb(0,0,0) });

    pageAct.drawText(DEPOSIT_AMOUNT, { x: 232, y: topY(378, hA), size: FS, font, color: rgb(0,0,0) });

    pageAct.drawText(price, { x: 276, y: topY(422, hA), size: FS, font, color: rgb(0,0,0) });
    pageAct.drawText(priceWords + " гривень", { x: 340, y: topY(422, hA), size: FS, font, color: rgb(0,0,0) });

    pageAct.drawText(returnAddr, { x: 90, y: topY(467, hA), size: FS, font, color: rgb(0,0,0) });

    // Речення про пошкодження на відео (у перше з трьох порожніх полів пункту 8)
    pageAct.drawText("усі наявні пошкодження на відео; вилка та диск - цілі.", { x: 128, y: topY(541.5, hA), size: 8, font, color: rgb(0,0,0) });

    pageAct.drawImage(courierSigImage, { x: 330, y: topY(700, hA), width: 85, height: 26 });

    // Підпис ФОПа лише у верхньому блоці "НАЙМОДАВЕЦЬ - ПЕРЕДАВ" (x=90).
    // Нижній блок "НАЙМОДАВЕЦЬ - ПРИЙНЯВ" (x=330) навмисно залишається порожнім.
    if (fopSigImage2) {
      pageAct.drawImage(fopSigImage2, { x: 90, y: topY(700, hA), width: 85, height: 26 });
    }

    const signedPdfBytes = await pdfDoc.save();
    const signedPdfBuffer = Buffer.from(signedPdfBytes);
    const fileName = "contracts/contract-" + courierId + "-" + Date.now() + ".pdf";

    const { error: uploadError } = await supabaseAdmin.storage.from("documents").upload(fileName, signedPdfBuffer, { contentType: "application/pdf", upsert: true });
    if (uploadError) {
      console.error("sign-contract: storage upload failed", uploadError);
      return NextResponse.json({ success: false, error: "Не вдалося зберегти PDF договору" }, { status: 500 });
    }
    const { data: urlData } = supabaseAdmin.storage.from("documents").getPublicUrl(fileName);
    const pdfUrl = urlData.publicUrl;

    const signedAt = new Date().toISOString();

    // Критичний апдейт: посилання на договір пишемо ПЕРШИМ і ОКРЕМО від решти полів,
    // з одним ретраєм. Раніше все писалось одним update() разом з іншими полями кур'єра —
    // якщо той update падав (наприклад, через погані дані в іншому полі), PDF лишався
    // залитим у Storage, а картка кур'єра — без посилання і без ознак помилки для адміна.
    async function saveContractLink() {
      return supabaseAdmin.from("couriers").update({
        contract_pdf_url: pdfUrl,
        contract_signed_at: signedAt,
      }).eq("id", courierId);
    }

    let { error: contractLinkError } = await saveContractLink();
    if (contractLinkError) {
      console.error("sign-contract: contract link update failed, retrying once", contractLinkError);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      ({ error: contractLinkError } = await saveContractLink());
    }
    if (contractLinkError) {
      console.error("sign-contract: contract link update failed after retry", contractLinkError, "pdfUrl was:", pdfUrl);
      return NextResponse.json({ success: false, error: "Договір збережено, але не вдалося прив'язати його до картки кур'єра. Зверніться до адміністратора.", pdfUrl }, { status: 500 });
    }

    const { error: courierUpdateError } = await supabaseAdmin.from("couriers").update({
      status: "pending",
      city,
      address,
      tax_id: taxId,
      passport_series: passport,
      weekly_price: parseInt(price) || 2400,
      scooter_model: scooterModel,
    }).eq("id", courierId);
    if (courierUpdateError) {
      console.error("sign-contract: couriers profile update failed", courierUpdateError, "pdfUrl was:", pdfUrl);
      return NextResponse.json({ success: false, error: "Договір підписано й збережено, але не вдалося оновити решту даних кур'єра. Зверніться до адміністратора.", pdfUrl }, { status: 500 });
    }

    if (courierEmail) {
      try {
        await resend.emails.send({
          from: "ScooterRental <onboarding@resend.dev>",
          to: courierEmail,
          subject: "Договір підписано",
          html: "<h2>Договір №" + contractNumber + "</h2><p>" + courierName + " | " + city + " | " + price + " грн/тиж | " + scooterModel + "</p><a href='" + pdfUrl + "'>Завантажити</a>",
        });
      } catch (emailErr) {
        console.error("Email error", emailErr);
      }
    }

    // Копія підписаного договору адміну — на email (вкладенням) і в Telegram
    try {
      await resend.emails.send({
        from: "ScooterRental <onboarding@resend.dev>",
        to: FOP_EMAIL,
        subject: "Новий підписаний договір №" + contractNumber,
        html: "<h2>Договір №" + contractNumber + "</h2><p>" + courierName + " | " + courierPhone + " | " + city + " | " + price + " грн/тиж | " + scooterModel + "</p><a href='" + pdfUrl + "'>Завантажити</a>",
        attachments: [
          { filename: "contract-" + contractNumber + ".pdf", content: signedPdfBuffer.toString("base64") },
        ],
      });
    } catch (adminEmailErr) {
      console.error("Admin email error", adminEmailErr);
    }

    try {
      const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID;
      if (BOT_TOKEN && ADMIN_CHAT_ID) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: ADMIN_CHAT_ID,
            document: pdfUrl,
            caption:
              "📄 Новий підписаний договір №" + contractNumber + "\n" +
              courierName + "\n" + courierPhone + "\n" + city + " | " + price + " грн/тиж | " + scooterModel,
          }),
        });

        // Окреме сповіщення про нову реєстрацію (очікує оплату)
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: ADMIN_CHAT_ID,
            parse_mode: "HTML",
            text:
              "🆕 <b>Новий кур'єр зареєструвався</b>\n\n" +
              courierName + "\n" + courierPhone + "\n" + city + " | " + price + " грн/тиж | " + scooterModel + "\n\n" +
              "⏳ Очікує оплати (онлайн або готівкою)",
          }),
        });
      }
    } catch (tgErr) {
      console.error("Admin telegram error", tgErr);
    }

    return NextResponse.json({ success: true, pdfUrl, contractNumber });

  } catch (error) {
    console.error("sign-contract error", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
