"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Crop, Hammer, ImageOff, Loader2, Ruler, Type } from "lucide-react";
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
  const [files, setFiles] = useState<Array<File>>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const router = useRouter();

  async function handleBuild(): Promise<void> {
    if (sending || files.length === 0) return;
    setSending(true);
    setSendError(null);
    try {
      const first = files[0];
      if (first === undefined) throw new Error("Нет фото: прикрепите jpg, png или webp.");
      const form = new FormData();
      form.append("files", first, first.name);
      form.append("marketplace", marketplace);
      const res = await fetch("/api/jobs", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as {
        jobs?: Array<{ id: string }>;
        error?: string;
      } | null;
      if (!res.ok || body?.jobs?.[0] === undefined) {
        throw new Error(body?.error ?? `джоба не создалась (${res.status})`);
      }
      const job = body.jobs[0];
      if (job === undefined) throw new Error("Пустой ответ сервера. Попробуйте ещё раз.");
      router.push(`/studio/${job.id}`);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Не отправилось. Попробуйте ещё раз.");
      setSending(false);
    }
  }

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
            Одно фото — одна карточка: белый фон, пропорции площадки,
            чек-лист с замерами и текст. Для каталога есть батч-режим на 20 фото.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-[1.4fr_1fr]">
            <Dropzone onFiles={setFiles} />
            <div className="flex flex-col gap-4">
              <MarketplacePicker value={marketplace} onChange={setMarketplace} />
              <button
                type="button"
                onClick={() => void handleBuild()}
                disabled={sending || files.length === 0}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-control bg-accent px-6 py-3 font-bold text-accent-ink transition-colors duration-200 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Hammer className="h-4 w-4" aria-hidden="true" />
                )}
                {sending ? "Отправляю…" : "Собрать карточку"}
              </button>
              {sendError !== null && (
                <p role="alert" className="text-sm leading-relaxed text-red-300">
                  {sendError}
                </p>
              )}
              <p className="text-xs leading-relaxed text-faint">
                Первое фото станет главным кадром · выбрана площадка: {marketplace} ·{" "}
                <a href="/batch" className="underline underline-offset-2 hover:text-paper">
                  каталог из 5–20 фото — в батч-режиме
                </a>
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
