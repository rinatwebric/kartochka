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
          className="max-w-xl text-2xl font-extrabold tracking-tight md:text-3xl"
        >
          Как это работает
        </h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="rounded-card border border-white/10 bg-ink-900 p-6"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-control bg-ink-700">
                  <step.icon
                    className="h-5 w-5 text-accent"
                    aria-hidden="true"
                  />
                </span>
                <span
                  className="text-sm font-bold text-faint tabular-nums"
                  aria-hidden="true"
                >
                  0{index + 1}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {step.text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
