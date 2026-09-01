export default function PaymentSuccessPage() {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
        <h1 className="text-2xl font-bold text-slate-900">Оплату отримано!</h1>
        <p className="text-slate-500 mt-2 mb-6">
          Дякуємо за оплату. Ваша підписка активована на 7 днів.
        </p>
        {botUsername && (
          <a
            href={`https://t.me/${botUsername}`}
            target="_blank"
            className="inline-block bg-blue-500 text-white rounded-xl px-6 py-3 font-semibold hover:bg-blue-600 mb-4"
          >
            💬 Приєднатися до Telegram-бота
          </a>
        )}
        <p className="text-sm text-slate-400">
          Наступне списання відбудеться автоматично через 7 днів. У боті ви отримаєте нагадування заздалегідь.
        </p>
      </div>
    </div>
  );
}
