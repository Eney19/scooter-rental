"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const WEEKLY_PRICE_BY_CITY: Record<string, number> = {
  "Луцьк": 2400,
  "Рівне": 2400,
  "Львів": 2100,
};
const DEFAULT_WEEKLY_PRICE = 2400;

export default function PaymentPage() {
  const params = useParams();
  const courierId = params.id as string;

  const [status, setStatus] = useState<"loading" | "redirecting" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [amount, setAmount] = useState<number | null>(null);

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
        setStatus("redirecting");

        // Перенаправляємо на сторінку оплати Monobank
        window.location.href = data.pageUrl;
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

        {status === "redirecting" && (
          <>
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              💳
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Оренда електроскутера</h1>
            {amount !== null && (
              <p className="text-slate-700 mt-2 text-lg font-semibold">
                {amount} грн за 7 днів
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
