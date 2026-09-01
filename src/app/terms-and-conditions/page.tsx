export default function TermsAndConditionsPage() {
  return (
    <div className="min-h-screen bg-white px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Правила і умови надання послуг</h1>
        <p className="text-slate-500 mb-8">Останнє оновлення: 23 червня 2026 р.</p>

        <div className="prose prose-slate max-w-none space-y-6 text-slate-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Загальні положення</h2>
            <p>
              Ці Правила і умови (далі — «Умови») регулюють порядок надання послуг оренди електроскутерів сервісом PowerDrive.
            </p>
            <p>
              Виконавцем послуг є: <strong>ФОП Щурук Андрій Ярославович</strong>, РНОКПП: 3447201478, дата державної реєстрації 05.07.2023, номер запису 2001980000000037808.
            </p>
            <p>
              Користуючись сервісом PowerDrive, ви погоджуєтесь з цими Умовами в повному обсязі.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Опис послуги</h2>
            <p>
              PowerDrive надає в оренду електроскутери курʼєрам для здійснення доїздів у містах Луцьк, Рівне та Львів. Оренда здійснюється на основі договору прокату, що укладається шляхом електронного підписання та підтвердження SMS-кодом.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Порядок реєстрації та укладення договору</h2>
            <p>Для початку користування послугою орендар повинен:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Заповнити реєстраційну форму з персональними даними</li>
              <li>Надати скановані копії документів (паспорт, довідка про місце проживання, картка платника податків)</li>
              <li>Підписати договір прокату електронним підписом</li>
              <li>Підтвердити підписання SMS-кодом, надісланим на вказаний номер телефону</li>
            </ul>
            <p className="mt-2">
              Договір вважається укладеним з моменту успішного підтвердження SMS-кодом.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Вартість послуг</h2>
            <p>
              Вартість оренди електроскутера встановлюється у тижневому форматі та залежить від міста надання послуги:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>м. Луцьк — 2400 грн / 7 днів</li>
              <li>м. Рівне — 2400 грн / 7 днів</li>
              <li>м. Львів — 2100 грн / 7 днів</li>
            </ul>
            <p className="mt-2">
              Поточні тарифи також відображаються в боті Telegram сервісу та на платіжній сторінці перед оплатою.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Способи оплати</h2>
            <p>Оплата послуг здійснюється одним із наступних способів:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Банківською карткою (Visa, Mastercard) через платіжну систему Monobank</li>
              <li>Apple Pay та Google Pay через платіжну систему Monobank</li>
            </ul>
            <p className="mt-2">
              Оплата здійснюється на тижневій основі. Нагадування про оплату надсилаються через Telegram-бота сервісу.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Умови надання та повернення скутера</h2>
            <p>
              Електроскутер передається орендарю після підписання договору та здійснення оплати. Місце і час передачі узгоджується з менеджером сервісу.
            </p>
            <p>
              Орендар зобовʼязаний використовувати скутер відповідно до правил дорожнього руху та технічних інструкцій, наданих сервісом, і повернути скутер у належному стані після завершення строку оренди або на вимогу сервісу.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Відповідальність сторін</h2>
            <p>
              Орендар несе відповідальність за збереження та належну експлуатацію орендованого електроскутера протягом усього строку дії договору. Детальні умови відповідальності визначаються договором прокату, що підписується під час реєстрації.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">8. Зміни до Умов</h2>
            <p>
              Сервіс залишає за собою право вносити зміни до цих Умов. Актуальна версія Умов завжди доступна на цій сторінці.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">9. Контактна інформація</h2>
            <p>З питань щодо умов надання послуг звертайтесь:</p>
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
