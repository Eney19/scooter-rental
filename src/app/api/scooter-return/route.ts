import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument } from "pdf-lib";

function topY(top: number, pageHeight: number) {
  return pageHeight - top;
}

export async function POST(req: NextRequest) {
  try {
    const { courierId, signatureDataUrl } = await req.json();

    if (!courierId || !signatureDataUrl) {
      return NextResponse.json({ success: false, error: "Відсутні дані" }, { status: 400 });
    }

    const { data: courier, error: courierErr } = await supabaseAdmin
      .from("couriers")
      .select("id, full_name")
      .eq("id", courierId)
      .single();

    if (courierErr || !courier) {
      return NextResponse.json({ success: false, error: "Кур'єра не знайдено" }, { status: 404 });
    }

    // Шукаємо найновіший підписаний договір цього кур'єра напряму в Storage
    const { data: files, error: listErr } = await supabaseAdmin.storage
      .from("documents")
      .list("contracts", { limit: 1000, sortBy: { column: "created_at", order: "desc" } });

    if (listErr || !files) {
      return NextResponse.json({ success: false, error: "Помилка доступу до сховища договорів" }, { status: 500 });
    }

    const courierFiles = files
      .filter((f) => f.name.startsWith(`contract-${courierId}-`))
      .sort((a, b) => (b.name > a.name ? 1 : -1));

    if (courierFiles.length === 0) {
      return NextResponse.json({ success: false, error: "Договір кур'єра не знайдено" }, { status: 404 });
    }

    const contractPath = `contracts/${courierFiles[0].name}`;
    const { data: contractFile, error: downloadErr } = await supabaseAdmin.storage
      .from("documents")
      .download(contractPath);

    if (downloadErr || !contractFile) {
      return NextResponse.json({ success: false, error: "Не вдалося завантажити договір" }, { status: 500 });
    }

    const contractBytes = await contractFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(contractBytes);

    const pages = pdfDoc.getPages();
    const pageAct = pages[6]; // 7-ма сторінка (акт), індекс 6
    const hA = pageAct.getHeight();

    // Підпис кур'єра (Наймач - Повернув, ліва колонка x=90)
    const courierSigBase64 = signatureDataUrl.replace(/^data:image\/png;base64,/, "");
    const courierSigBytes = Buffer.from(courierSigBase64, "base64");
    const courierSigImage = await pdfDoc.embedPng(courierSigBytes);
    pageAct.drawImage(courierSigImage, { x: 90, y: topY(740, hA), width: 85, height: 26 });

    // Підпис ФОП (Наймодавець - Прийняв, права колонка x=330)
    try {
      const fopSigRes = await fetch("https://jaenpkdnhlcpyyzwlqui.supabase.co/storage/v1/object/public/templates/signature-fop.png");
      if (fopSigRes.ok) {
        const fopSigBytes = await fopSigRes.arrayBuffer();
        const fopSigImage = await pdfDoc.embedPng(new Uint8Array(fopSigBytes));
        pageAct.drawImage(fopSigImage, { x: 330, y: topY(740, hA), width: 85, height: 26 });
      }
    } catch {
      console.log("FOP signature not found for return act");
    }

    const updatedPdfBytes = await pdfDoc.save();
    const updatedPdfBuffer = Buffer.from(updatedPdfBytes);
    const fileName = "contracts/return-" + courierId + "-" + Date.now() + ".pdf";

    await supabaseAdmin.storage.from("documents").upload(fileName, updatedPdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });
    const { data: urlData } = supabaseAdmin.storage.from("documents").getPublicUrl(fileName);
    const returnPdfUrl = urlData.publicUrl;

    await supabaseAdmin
      .from("couriers")
      .update({
        status: "inactive",
        return_signed_at: new Date().toISOString(),
        return_pdf_url: returnPdfUrl,
      })
      .eq("id", courierId);

    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("courier_id", courierId)
      .eq("status", "active");

    return NextResponse.json({ success: true, pdfUrl: returnPdfUrl });
  } catch (error) {
    console.error("Scooter return error:", error);
    return NextResponse.json({ success: false, error: "Внутрішня помилка" }, { status: 500 });
  }
}
