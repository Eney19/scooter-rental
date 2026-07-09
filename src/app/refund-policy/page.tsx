export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-white px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Правила повернення грошових коштів</h1>
        <p className="text-slate-500 mb-8">Останнє оновлення: 23 червня 2026 р.</p>

        <div className="prose prose-slate max-w-none space-y-6 text-slate-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Загальні положення</h2>
            <p>
              Ці Правила визначають умови та порядок повернення грошових коштів, сплачених за послуги оренди електроскутерів сервісу PowerDrive, виконавцем яких є <strong>ФОП Щурук Андрій Ярославович</strong>, РНОКПП: 3447201478.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Коли кошти повертаються</h2>
            <p>
              Сплачені кошти повертаються в повному обсязі, якщо електроскутер <strong>ще не було видано</strong> орендарю на момент звернення за поверненням.
            </p>
            <p>
              Для оформлення повернення орендар повинен звернутися до сервісу за контактами, вказаними нижче, протягом строку дії оплаченого періоду оренди.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Коли кошти не повертаються</h2>
            <p>
              Кошти не повертаються, якщо електроскутер вже було передано орендарю у фізичне користування. У такому випадку послуга вважається наданою в повному обсязі.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Порядок повернення коштів</h2>
            <p>Для повернення коштів орендар повинен:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Звернутися до сервісу за контактами, вказаними нижче</li>
              <li>Повідомити номер замовлення або номер телефону, вказаний при оплаті</li>
              <li>Описати причину звернення за поверненням</li>
            </ul>
            <p className="mt-2">
              Кошти повертаються на банківську картку, з якої було здійснено оплату, протягом строків, встановлених платіжною системою WayForPay (зазвичай до 14 банківських днів).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Скасування транзакції</h2>
            <p>
              У разі технічної помилки під час оплати (подвійне списання, помилкова сума) орендар має право звернутися для скасування транзакції та повернення коштів протягом 24 годин з моменту здійснення платежу.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Контактна інформація</h2>
            <p>З питань повернення коштів звертайтесь:</p>
            <ul className="list-none pl-0 space-y-1 mt-2">
              <li>📧 Email: <a href="mailto:anteyfgh41@gmail.com" className="text-blue-600 underline">anteyfgh41@gmail.com</a></li>
              <li>📞 Телефон: <a href="tel:+380663833878" className="text-blue-600 underline">+38 (066) 383-38-78</a></li>
            </ul>
          </section>

        </div>

        <div className="mt-10 pt-6 border-t border-slate-200">
          <a href="/register" className="text-blue-600 hover:text-blue-700 text-sm">← Повернутись до реєстрації</a>
        </div>
      </div>
    </div>
  );
}
