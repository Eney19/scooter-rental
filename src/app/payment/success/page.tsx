export default function PaymentSuccessPage() {
  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
        <h1 className="text-2xl font-bold text-slate-900">Оплату отримано!</h1>
        <p className="text-slate-500 mt-2 mb-6">
          Дякуємо за оплату. Ваша підписка активована на 7 днів.
        </p>
        <p className="text-sm text-slate-400">
          Наступне списання відбудеться автоматично через 7 днів.
        </p>
      </div>
    </div>
  );
}
