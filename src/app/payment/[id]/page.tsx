"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function PaymentPage() {
  const params = useParams();
  const courierId = params.id as string;

  const [status, setStatus] = useState<"loading" | "confirm" | "redirecting" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [rentAmount, setRentAmount] = useState<number | null>(null);
  const [deposit, setDeposit] = useState<number>(0);
  const [pageUrl, setPageUrl] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/monopay/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courierId }),
        });

        const data = await res.json();

        if (!data.success || !data.pageUrl) {
          setStatus("error");
          setErrorMessage(data.error || "Не вдалося створити платіж. Спробуйте ще раз.");
          return;
        }

        setAmount(data.amount);
        setRentAmount(data.rentAmount ?? data.amount);
        setDeposit(data.deposit ?? 0);
        setPageUrl(data.pageUrl);

        if (data.deposit > 0) {
          // Перша оплата — показуємо розбивку (оренда + завдаток), не перенаправляємо одразу
          setStatus("confirm");
        } else {
          setStatus("redirecting");
          window.location.href = data.pageUrl;
        }
      } catch {
        setStatus("error");
        setErrorMessage("Сталася помилка з'єднання. Перевірте інтернет і спробуйте ще раз.");
      }
    }

    if (courierId) init();
  }, [courierId]);

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        {status === "loading" && (
          <>
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl animate-pulse">
              💳
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Готуємо оплату...</h1>
            <p className="text-slate-500 mt-2">Завантаження даних</p>
          </>
        )}

        {status === "confirm" && (
          <>
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              💳
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Оренда електроскутера</h1>
            <div className="mt-4 text-left bg-slate-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-slate-600">
                <span>Оренда за 7 днів</span>
                <span className="font-medium">{rentAmount} грн</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Завдаток за скутер</span>
                <span className="font-medium">{deposit} грн</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-slate-900 font-bold text-lg">
                <span>Всього до оплати</span>
                <span>{amount} грн</span>
              </div>
            </div>
            <p className="text-slate-400 text-xs mt-3">
              Завдаток стягується одноразово, при першій оплаті, і повертається при поверненні скутера.
            </p>
            <button
              onClick={() => {
                if (!pageUrl) return;
                setStatus("redirecting");
                window.location.href = pageUrl;
              }}
              className="w-full mt-5 bg-blue-600 text-white rounded-xl py-3.5 text-lg font-bold hover:bg-blue-700 transition-colors"
            >
              Перейти до оплати
            </button>
          </>
        )}

        {status === "redirecting" && (
          <>
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              💳
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Оренда електроскутера</h1>
            {amount !== null && (
              <p className="text-slate-700 mt-2 text-lg font-semibold">
                {amount} грн{deposit === 0 ? " за 7 днів" : ""}
              </p>
            )}
            <p className="text-slate-500 mt-4">
              Переходимо на сторінку оплати monobank...
            </p>
            <div className="mt-4 flex justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              ❌
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Помилка оплати</h1>
            <p className="text-slate-500 mt-2 mb-6">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Спробувати ще раз
            </button>
          </>
        )}
      </div>
    </div>
  );
}
