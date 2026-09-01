"use client";
import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import SignaturePad from "signature_pad";
import { supabase } from "@/lib/supabase";

export default function ReturnScooterPage() {
  const params = useParams();
  const courierId = params.courierId as string;

  const [courierName, setCourierName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("couriers")
        .select("full_name")
        .eq("id", courierId)
        .single();
      if (data) setCourierName(data.full_name);
      setLoading(false);
      setTimeout(() => {
        if (canvasRef.current) sigPadRef.current = new SignaturePad(canvasRef.current);
      }, 300);
    }
    load();
  }, [courierId]);

  async function handleSubmit() {
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      setError("Будь ласка, поставте підпис");
      return;
    }
    setSubmitting(true);
    setError(null);

    const signatureDataUrl = sigPadRef.current.toDataURL("image/png");

    const res = await fetch("/api/scooter-return", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courierId, signatureDataUrl }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!data.success) {
      setError(data.error || "Помилка. Спробуйте ще раз");
      return;
    }
    setPdfUrl(data.pdfUrl || null);
    setDone(true);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400">Завантаження...</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
          <h1 className="text-2xl font-bold text-slate-900">Скутер здано!</h1>
          <p className="text-slate-500 mt-2 mb-4">Дякуємо за співпрацю з PowerDrive.</p>
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              className="inline-block bg-blue-600 text-white rounded-xl px-6 py-3 font-semibold hover:bg-blue-700"
            >
              📄 Переглянути підписаний акт
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <h1 className="text-2xl font-bold text-slate-900 text-center">Здача скутера</h1>
          <p className="text-slate-500 text-center text-sm">{courierName}</p>
          <p className="text-slate-600 text-sm">
            Підписуючи цей акт, ви підтверджуєте повернення електроскутера PowerDrive у справному стані.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ваш підпис *</label>
            <canvas
              ref={canvasRef}
              width={370}
              height={150}
              className="w-full border-2 border-dashed border-blue-200 rounded-xl bg-slate-50 touch-none"
            />
            <button
              type="button"
              onClick={() => sigPadRef.current?.clear()}
              className="text-xs text-slate-400 mt-1 hover:text-slate-600"
            >
              Очистити підпис
            </button>
          </div>
          {error && <p className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Обробка..." : "Підтвердити здачу ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}
