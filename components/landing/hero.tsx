import { ArrowRight, Footprints, ShieldCheck } from "lucide-react";
import Link from "next/link";

export function Hero(): React.ReactElement {
  return (
    <section className="border-b border-white/10">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-14 md:grid-cols-[1.2fr_1fr] md:py-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-chip border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm text-lavender">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            Валидатор регламента, а не фотостудия
          </p>
          <h1 className="mt-5 max-w-xl font-display text-3xl leading-[1.15] font-bold tracking-tight text-balance md:text-5xl">
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
              className="inline-flex items-center gap-2 rounded-control border border-white/15 px-6 py-3 font-semibold text-paper transition-colors duration-200 hover:border-accent/60 hover:bg-accent/10"
            >
              Посмотреть готовый пример
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <figure
          aria-label="Пример готовой карточки с оценкой соответствия"
          className="mx-auto w-full max-w-xs rounded-shelf border border-white/10 bg-ink-900 p-3 shadow-case"
        >
          <div className="relative overflow-hidden rounded-card bg-white">
            <div className="flex aspect-[3/4] items-center justify-center">
              <Footprints
                className="h-24 w-24 text-ink-800/15"
                aria-hidden="true"
              />
            </div>
            <span className="absolute top-2 left-2 rounded-chip bg-ink-950/85 px-2.5 py-1 text-[11px] font-bold text-paper tabular-nums">
              255,255,255
            </span>
            <span className="absolute top-2 right-2 rounded-chip bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-ink tabular-nums">
              92/100
            </span>
            <span className="absolute bottom-2 left-2 rounded-chip bg-ink-950/85 px-2.5 py-1 text-[11px] font-semibold text-paper">
              3:4 · 900×1200
            </span>
          </div>
          <figcaption className="px-1 pt-3 pb-1">
            <p className="truncate text-sm font-bold text-paper">
              Кроссовки городские, белые
            </p>
            <p className="mt-1.5 flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-chip bg-emerald-400/15 px-2 py-0.5 font-bold text-emerald-300">
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                Пройдёт
              </span>
              <span className="text-faint">WB · 8 из 8 пунктов</span>
            </p>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
