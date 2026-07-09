import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase";

const resend = new Resend(process.env.RESEND_API_KEY);
const FOP_EMAIL = process.env.FOP_EMAIL || "anteyfgh41@gmail.com";
const FOP_SIGNATURE_URL = "https://jaenpkdnhlcpyyzwlqui.supabase.co/storage/v1/object/public/templates/signature-fop.jpg";

// PDF координати (сторінка висота 842pt, pdf-lib рахує знизу)
function flipY(y: number, pageHeight: number) {
  return pageHeight - y;
}

export async function POST(req: NextRequest) {
  try {
    const {
      courierName, courierPhone, courierEmail,
      taxId, passport, address, city,
      signatureDataUrl, courierId,
    } = await req.json();

    console.log("sign-contract: received courierId =", courierId, "city =", city);

    // 1. Завантажуємо шаблон PDF
    const templateRes = await fetch(
      "https://jaenpkdnhlcpyyzwlqui.supabase.co/storage/v1/object/public/templates/contract-template.pdf"
    );
    if (!templateRes.ok) throw new Error("Не вдалось завантажити шаблон договору");
    const templateBytes = await templateRes.arrayBuffer();

    const pdfDoc = await PDFDocument.load(templateBytes);
    pdfDoc.registerFontkit(fontkit);
    const pages = pdfDoc.getPages();
    // Завантажуємо шрифт з підтримкою кирилиці
    const fontRes = await fetch(
      "https://jaenpkdnhlcpyyzwlqui.supabase.co/storage/v1/object/public/templates/Ubuntu-Regular.ttf"
    );
    const fontBytes = await fontRes.arrayBuffer();
    const font = await pdfDoc.embedFont(fontBytes);

    const now = new Date();
    const day = now.getDate().toString().padStart(2, "0");
    const months = ["січня","лютого","березня","квітня","травня","червня","липня","серпня","вересня","жовтня","листопада","грудня"];
    const month = months[now.getMonth()];
    const year = now.getFullYear();
    const dateStr = `${now.toLocaleDateString("uk-UA")}`;

    // ── СТОРІНКА 1 (index 0) ──────────────────────────────────────
    const page1 = pages[0];
    const h1 = page1.getSize().height; // 842

    // Дата: «___» __________ 2024 → координати з pymupdf: y=168, x=396
    // Замінюємо «___» на день, __________ на місяць
    page1.drawText(day, { x: 400, y: flipY(175, h1), size: 10, font, color: rgb(0,0,0) });
    page1.drawText(month, { x: 432, y: flipY(175, h1), size: 10, font, color:rgb(0,0,0) });

    // ПІБ кур'єра після "ФІЗИЧНА ОСОБА," — y=315, x=195
    page1.drawText(courierName, { x: 197, y: flipY(322, h1), size: 10, font, color: rgb(0,0,0) });

    // Паспорт після "паспорта громадянина України" — y=331, x=72
    page1.drawText(passport, { x: 74, y: flipY(350, h1), size: 10, font, color: rgb(0,0,0) });

    // ── СТОРІНКА 9 (index 8) — РЕКВІЗИТИ НАЙМАЧА ─────────────────
    const page9 = pages[8];
    const h9 = page9.getSize().height; // 842

    // ПІБ кур'єра під "ФІЗИЧНА ОСОБА" — y=141
    page9.drawText(courierName, { x: 280, y: flipY(148, h9), size: 9, font, color: rgb(0,0,0) });

    // Адреса — y=197, x=323
    page9.drawText(address + ", " + city, { x: 323, y: flipY(204, h9), size: 8, font, color: rgb(0,0,0) });

    // Ідентифікаційний код — y=252, x=397
    page9.drawText(taxId, { x: 397, y: flipY(259, h9), size: 9, font, color: rgb(0,0,0) });

    // Серія номер паспорту — y=280, x=397
    page9.drawText(passport, { x: 397, y: flipY(287, h9), size: 9, font, color: rgb(0,0,0) });

    // Номер телефону — y=308, x=370
    page9.drawText(courierPhone, { x: 370, y: flipY(315, h9), size: 9, font, color: rgb(0,0,0) });

    // Дата під підписом наймача
    page9.drawText(dateStr, { x: 280, y: flipY(385, h9), size: 8, font, color: rgb(0.4,0.4,0.4) });

    // Підпис кур'єра на сторінці 9 — y=364, x=280
    const courierSigBase64 = signatureDataUrl.replace(/^data:image\/png;base64,/, "");
    const courierSigBytes = Buffer.from(courierSigBase64, "base64");
    const courierSigImage = await pdfDoc.embedPng(courierSigBytes);
    page9.drawImage(courierSigImage, {
      x: 280,
      y: flipY(360, h9),
      width: 100,
      height: 40,
    });

    // Підпис ФОП на сторінці 9 — x=77, y=368
    try {
      const fopSigRes = await fetch(FOP_SIGNATURE_URL);
      if (fopSigRes.ok) {
        const fopSigBytes = await fopSigRes.arrayBuffer();
        const fopSigImage = await pdfDoc.embedJpg(new Uint8Array(fopSigBytes));
        page9.drawImage(fopSigImage, {
          x: 77,
          y: flipY(368, h9),
          width: 100,
          height: 40,
        });
        page9.drawText(dateStr, { x: 77, y: flipY(385, h9), size: 8, font, color: rgb(0.4,0.4,0.4) });
      }
    } catch {
      // Підпис ФОП не знайдено
    }

    // 6. Зберігаємо PDF
    const signedPdfBytes = await pdfDoc.save();
    const signedPdfBuffer = Buffer.from(signedPdfBytes);

    // 7. Завантажуємо в Supabase Storage
    const fileName = `contracts/contract-${courierId}-${Date.now()}.pdf`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("documents")
      .upload(fileName, signedPdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseAdmin.storage
      .from("documents")
      .getPublicUrl(fileName);
    const pdfUrl = urlData.publicUrl;

    // 8. Оновлюємо запис кур'єра
    const { error: updateError, data: updateData, count: updateCount } = await supabaseAdmin
      .from("couriers")
      .update({
        status: "active",
        city,
        address,
        tax_id: taxId,
        passport_series: passport,
      })
      .eq("id", courierId)
      .select();

    console.log("sign-contract: update result", {
      updateError,
      updateData,
      updateCount,
      courierId,
    });

    if (updateError) {
      console.error("sign-contract: courier update failed:", updateError);
    }

    // 9. Email кур'єру
    if (courierEmail) {
      await resend.emails.send({
        from: "ScooterRental <onboarding@resend.dev>",
        to: courierEmail,
        subject: "Ваш договір оренди електроскутера",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:#1d4ed8">Договір підписано! 🛵</h2>
            <p>Вітаємо, <strong>${courierName}</strong>!</p>
            <p>Ваш договір оренди електроскутера підписано та збережено.</p>
            <p><strong>Деталі договору:</strong></p>
            <ul>
              <li>РНОКПП: ${taxId}</li>
              <li>Паспорт: ${passport}</li>
              <li>Місто: ${city}</li>
              <li>Адреса: ${address}</li>
              <li>Дата підписання: ${dateStr}</li>
            </ul>
            <a href="${pdfUrl}" style="display:inline-block;background:#1d4ed8;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:16px">
              📄 Завантажити договір PDF
            </a>
            <p style="color:#6b7280;margin-top:24px;font-size:14px">
              Очікуйте на зв'язок від менеджера для отримання скутера.
            </p>
          </div>
        `,
        attachments: [{
          filename: `contract-${courierId}.pdf`,
          content: signedPdfBuffer.toString("base64"),
        }],
      });
    }

    // 10. Email ФОП
    await resend.emails.send({
      from: "ScooterRental <onboarding@resend.dev>",
      to: FOP_EMAIL,
      subject: `Новий договір — ${courierName} (${city})`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#1d4ed8">Новий підписаний договір</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;color:#6b7280">ПІБ</td><td style="padding:8px"><strong>${courierName}</strong></td></tr>
            <tr style="background:#f8fafc"><td style="padding:8px;color:#6b7280">Телефон</td><td style="padding:8px">${courierPhone}</td></tr>
            <tr><td style="padding:8px;color:#6b7280">Email</td><td style="padding:8px">${courierEmail || "—"}</td></tr>
            <tr style="background:#f8fafc"><td style="padding:8px;color:#6b7280">РНОКПП</td><td style="padding:8px">${taxId}</td></tr>
            <tr><td style="padding:8px;color:#6b7280">Паспорт</td><td style="padding:8px">${passport}</td></tr>
            <tr style="background:#f8fafc"><td style="padding:8px;color:#6b7280">Місто</td><td style="padding:8px">${city}</td></tr>
            <tr><td style="padding:8px;color:#6b7280">Адреса</td><td style="padding:8px">${address}</td></tr>
            <tr style="background:#f8fafc"><td style="padding:8px;color:#6b7280">Дата</td><td style="padding:8px">${dateStr}</td></tr>
          </table>
          <a href="${pdfUrl}" style="display:inline-block;background:#1d4ed8;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:16px">
            📄 Відкрити договір PDF
          </a>
        </div>
      `,
      attachments: [{
        filename: `contract-${courierId}.pdf`,
        content: signedPdfBuffer.toString("base64"),
      }],
    });

    return NextResponse.json({ success: true, pdfUrl });

  } catch (error) {
    console.error("sign-contract error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Невідома помилка" },
      { status: 500 }
    );
  }
}
