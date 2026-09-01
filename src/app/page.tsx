import Link from "next/link";

const STEPS = [
  { n: "01", title: "Обери модель і місто", text: "Луцьк, Рівне або Львів — модель можна змінити пізніше." },
  { n: "02", title: "Заповни заявку онлайн", text: "SMS-підтвердження, підпис договору прямо на телефоні — 5 хвилин." },
  { n: "03", title: "Забери електроскутер", text: "У зручний для тебе час, з повним баком заряду і зарядним пристроєм." },
];

export default function Home() {
  return (
    <div className="bg-[#10131c] text-[#f5f3ee] min-h-screen">
      <style>{`
        @keyframes fillMeter { from { width: 0% } to { width: 92% } }
        .meter-fill { animation: fillMeter 1.4s ease-out 0.2s both; }
        @media (prefers-reduced-motion: reduce) {
          .meter-fill { animation: none; width: 92%; }
        }
      `}</style>

      <header className="relative overflow-hidden border-b border-[#2a3150] min-h-[420px] flex flex-col justify-end">
        <div className="absolute inset-0">
          <img
            src="/images/hero-scooter.jpg"
            alt="Електроскутер PowerDrive"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#10131c] via-[#10131c]/85 to-[#10131c]/40" />
        </div>
        <div className="relative max-w-5xl mx-auto px-6 pb-10 pt-16 w-full">
          <span className="inline-block font-bold text-sm tracking-wide text-[#10131c] bg-white px-3 py-1.5 rounded-full uppercase mb-4">
            PowerDrive · Луцьк · Рівне · Львів
          </span>
          <h1 className="font-semibold tracking-tight text-3xl sm:text-5xl leading-[0.95] max-w-2xl">
            Електроскутер для доставки.
            <span className="text-[#6b82f0]"> Вже сьогодні.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base sm:text-lg text-[#a9b0bd]">
            Оренда та повне технічне обслуговування електроскутерів для кур'єрів
            Bolt і Glovo. Ремонт, договір і підтримка — без турбот з твого боку.
          </p>
          <div className="mt-7">
            <Link
              href="/register"
              className="h-12 px-7 inline-flex items-center rounded-full bg-white text-[#10131c] font-bold hover:bg-[#e7eaf5] transition-colors"
            >
              Зареєструватися
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 py-10 grid grid-cols-2 sm:grid-cols-4 gap-6 border-b border-[#2a3150]">
        {[
          ["150 км", "запас ходу"],
          ["6 год", "повна зарядка"],
          ["3 міста", "Луцьк · Рівне · Львів"],
          ["7 днів", "мінімальна оренда"],
        ].map(([n, l]) => (
          <div key={l}>
            <div className="text-2xl sm:text-3xl font-semibold">{n}</div>
            <div className="text-sm text-[#a9b0bd] mt-1">{l}</div>
          </div>
        ))}
      </section>

      <section className="border-t border-[#2a3150]">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="font-semibold text-2xl sm:text-3xl tracking-tight mb-8">
            Як це працює
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <div key={s.n}>
                <div className="text-[#3d56c9] text-base font-semibold mb-2">{s.n}</div>
                <h3 className="font-bold mb-2">{s.title}</h3>
                <p className="text-sm text-[#a9b0bd]">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#2a3150]">
        <div className="max-w-5xl mx-auto px-6 py-16 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h2 className="font-semibold text-2xl sm:text-3xl tracking-tight">
              Готовий почати?
            </h2>
            <p className="text-[#a9b0bd] mt-2">
              Заявка займає 5 хвилин. Договір підписуєш онлайн.
            </p>
          </div>
          <Link
            href="/register"
            className="h-12 px-7 inline-flex items-center rounded-full bg-white text-[#10131c] font-bold hover:bg-[#e7eaf5] transition-colors whitespace-nowrap"
          >
            Зареєструватися
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#2a3150]">
        <div className="max-w-5xl mx-auto px-6 py-8 text-sm text-[#a9b0bd] flex flex-col sm:flex-row justify-between gap-3">
          <span>PowerDrive · Луцьк · Рівне · Львів</span>
          <a href="tel:+380663833878" className="hover:text-[#3d56c9]">
            (066) 383 38 78
          </a>
        </div>
      </footer>
    </div>
  );
}