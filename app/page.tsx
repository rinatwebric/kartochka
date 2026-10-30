"use client";

import { useState } from "react";
import { Crop, Hammer, ImageOff, Ruler, Type } from "lucide-react";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Dropzone } from "@/components/upload/dropzone";
import {
  MarketplacePicker,
  type Marketplace,
} from "@/components/upload/marketplace-picker";

const REJECTS: Array<{
  icon: typeof Crop;
  title: string;
  text: string;
}> = [
  {
    icon: ImageOff,
    title: "Фон не белый",
    text: "Ковёр, стол и тени вместо 255,255,255. Площадка режет такое на модерации.",
  },
  {
    icon: Ruler,
    title: "Не та пропорция",
    text: "WB ждёт 3:4, Amazon — от 2000 px по длинной стороне. Телефон снимает как попало.",
  },
  {
    icon: Crop,
    title: "Товар обрезан",
    text: "Край упирается в границу кадра или рука закрывает часть. Такое не пропускают.",
  },
  {
    icon: Type,
    title: "Текст на главном фото",
    text: "Надписи, рамки и инфографика на первом кадре запрещены почти везде.",
  },
];

export default function HomePage(): React.ReactElement {
  const [marketplace, setMarketplace] = useState<Marketplace>("wb");

  return (
    <main className="min-h-screen bg-ink-950 text-paper">
      <Hero />

      <section
        id="upload"
        aria-labelledby="upload-title"
        className="border-b border-white/10"
      >
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h2
            id="upload-title"
            className="max-w-xl text-2xl font-extrabold tracking-tight md:text-3xl"
          >
            Загрузите фото и выберите площадку
          </h2>
          <p className="mt-3 max-w-xl leading-relaxed text-muted">
            Проверка и сборка карточки появятся в следующих задачах. Сейчас
            страница принимает файлы и запоминает площадку.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-[1.4fr_1fr]">
            <Dropzone />
            <div className="flex flex-col gap-4">
              <MarketplacePicker value={marketplace} onChange={setMarketplace} />
              <button
                type="button"
                disabled
                title="Рабочая логика появится в T3 и дальше"
                className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-control bg-ink-700 px-6 py-3 font-bold text-muted"
              >
                <Hammer className="h-4 w-4" aria-hidden="true" />
                Собрать карточку
              </button>
              <p className="text-xs leading-relaxed text-faint">
                Кнопка пока неактивна: сборка и проверка — задачи T3 и дальше.
                Выбрана площадка: {marketplace}.
              </p>
            </div>
          </div>
        </div>
      </section>

      <HowItWorks />

      <section aria-labelledby="why-title">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h2
            id="why-title"
            className="max-w-xl text-2xl font-extrabold tracking-tight md:text-3xl"
          >
            Почему площадка не примет фото само по себе
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {REJECTS.map((item) => (
              <li
                key={item.title}
                className="flex gap-4 rounded-card border border-white/10 bg-ink-900 p-5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-ink-700">
                  <item.icon
                    className="h-5 w-5 text-accent"
                    aria-hidden="true"
                  />
                </span>
                <span>
                  <span className="block font-bold">{item.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted">
                    {item.text}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
