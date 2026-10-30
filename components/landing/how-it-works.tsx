import { PackageCheck, ShieldCheck, Upload } from "lucide-react";

const STEPS: Array<{
  icon: typeof Upload;
  title: string;
  text: string;
}> = [
  {
    icon: Upload,
    title: "Загрузите фото",
    text: "Одно фото с телефона: jpg, png или webp. Ковёр и стол на фоне — не страшно.",
  },
  {
    icon: ShieldCheck,
    title: "Получите разбор",
    text: "Замеряем фон, пропорции, заполнение кадра и обрезку. Каждый пункт — с числом.",
  },
  {
    icon: PackageCheck,
    title: "Заберите карточку",
    text: "Белый фон 255,255,255, нужный размер и текст карточки. Скачайте ZIP одним файлом.",
  },
];

export function HowItWorks(): React.ReactElement {
  return (
    <section aria-labelledby="how-title" className="border-b border-white/10">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <h2
          id="how-title"
          className="max-w-xl font-display text-xl font-bold tracking-tight md:text-2xl"
        >
          Как это работает
        </h2>
        <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative">
              <div className="flex items-center gap-4">
                <span
                  aria-hidden="true"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-accent/10 font-display text-sm font-bold text-accent"
                >
                  0{index + 1}
                </span>
                {index < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="hidden h-px flex-1 bg-accent/25 md:block"
                  />
                )}
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-ink-800 md:ml-0">
                  <step.icon
                    className="h-5 w-5 text-lavender"
                    aria-hidden="true"
                  />
                </span>
              </div>
              <h3 className="mt-4 text-lg font-bold">{step.title}</h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
                {step.text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
