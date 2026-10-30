import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";

export function Hero(): React.ReactElement {
  return (
    <section className="border-b border-white/10">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_1fr] md:py-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-chip border border-white/10 bg-ink-800 px-3 py-1.5 text-sm text-muted">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            Валидатор регламента, а не фотостудия
          </p>
          <h1 className="mt-5 max-w-xl text-4xl leading-[1.05] font-extrabold tracking-tight text-balance md:text-6xl">
            Карточку, которую площадка примет с первого раза
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Сфотографируйте товар на телефон где угодно — остальное проверим
            и соберём сами. Белый фон, пропорции и чек-лист — до кнопки
            «опубликовать».
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#upload"
              className="rounded-control bg-accent px-6 py-3 font-bold text-accent-ink transition-colors duration-200 hover:bg-accent-soft"
            >
              Проверить своё фото
            </a>
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 rounded-control border border-white/15 px-6 py-3 font-semibold text-paper transition-colors duration-200 hover:border-white/30 hover:bg-white/5"
            >
              Посмотреть готовый пример
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="flex flex-col justify-center rounded-card border border-white/10 bg-ink-900 p-8 shadow-lift">
          <p className="text-sm font-medium text-muted">
            Проверок регламента — автоматом
          </p>
          <p className="mt-2 text-7xl font-extrabold tracking-tight tabular-nums md:text-8xl">
            9<span className="text-accent">/10</span>
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Десятый пункт — ваш глаз: товар тот же, ракурс удачный. Остальное
            меряем кодом и моделью-судьёй.
          </p>
        </div>
      </div>
    </section>
  );
}
