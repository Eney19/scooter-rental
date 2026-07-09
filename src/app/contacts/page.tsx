export default function ContactsPage() {
  return (
    <div className="min-h-screen bg-white px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Контактна інформація</h1>
        <p className="text-slate-500 mb-8">Останнє оновлення: 23 червня 2026 р.</p>

        <div className="prose prose-slate max-w-none space-y-6 text-slate-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">Повне фірмове найменування</h2>
            <p>
              Фізична особа-підприємець Щурук Андрій Ярославович
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">Реєстраційні дані</h2>
            <ul className="list-none pl-0 space-y-1">
              <li><strong>РНОКПП:</strong> 3447201478</li>
              <li><strong>Дата державної реєстрації:</strong> 05.07.2023</li>
              <li><strong>Номер запису в ЄДР:</strong> 2001980000000037808</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">Юридична та фактична адреса</h2>
            <p>
              Україна, 43026, Волинська обл., Луцький р-н, м. Луцьк, вул. Конякіна, будинок 9, квартира 40
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">Контакти для звʼязку</h2>
            <ul className="list-none pl-0 space-y-1">
              <li>📞 Телефон: <a href="tel:+380663833878" className="text-blue-600 underline">+38 (066) 383-38-78</a></li>
              <li>📧 Email: <a href="mailto:anteyfgh41@gmail.com" className="text-blue-600 underline">anteyfgh41@gmail.com</a></li>
              <li>🌐 Сайт: <a href="https://powerdrive.in.ua" className="text-blue-600 underline">powerdrive.in.ua</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">Види економічної діяльності</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>77.39 Надання в оренду інших машин, устатковання та товарів (основний вид)</li>
              <li>77.21 Прокат товарів для спорту та відпочинку</li>
              <li>77.11 Надання в оренду автомобілів і легкових автотранспортних засобів</li>
              <li>45.40 Торгівля мотоциклами, деталями та приладдям до них, технічне обслуговування і ремонт мотоциклів</li>
              <li>45.20 Технічне обслуговування та ремонт автотранспортних засобів</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">Додаткова інформація</h2>
            <p>
              Перелік послуг, способи оплати та умови надання послуг доступні на сторінці{" "}
              <a href="/terms-and-conditions" className="text-blue-600 underline">Правила і умови надання послуг</a>.
            </p>
            <p>
              Умови повернення коштів доступні на сторінці{" "}
              <a href="/refund-policy" className="text-blue-600 underline">Правила повернення грошових коштів</a>.
            </p>
          </section>

        </div>

        <div className="mt-10 pt-6 border-t border-slate-200">
          <a href="/register" className="text-blue-600 hover:text-blue-700 text-sm">← Повернутись до реєстрації</a>
        </div>
      </div>
    </div>
  );
}
