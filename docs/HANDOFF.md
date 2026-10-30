# HANDOFF — передача контекста между чатами

Обновляется агентом в конце КАЖДОЙ задачи. Следующий чат начинается с чтения этого файла.

## Текущее состояние
T1 выполнен 30.10.2026. Лендинг собирается (`pnpm build` — Compiled successfully, static 6 routes), `pnpm dev` отдаёт `/` HTTP 200 со всеми блоками. Следующая задача — T2 (клиент моделей + MOCK).

## Что готово
- Дизайн-система: `app/globals.css` — токены Tailwind 4 (`@theme`): graphite `#0C0E12`/`#12151C`/`#171C26`/`#232B3A`, paper `#F2F4F7`, muted `#9AA3B2`, один акцент amber `#FFC531` (+soft/ink), радиусы 14/10/8, тени lift/flat, `color-scheme: dark`, focus-обводка акцентом, reduced-motion.
- Шрифт: `app/layout.tsx` — Manrope через `next/font/google` (subsets latin+cyrillic, variable `--font-sans`), `lang="ru"`, `class="dark"`, метаданные RU (title + description про WB/Ozon/Amazon и «9 из 10»).
- Лендинг `app/page.tsx` (client): `Hero` + секция `#upload` (dropzone + picker + disabled «Собрать карточку») + `HowItWorks` + инлайн-блок «Почему площадка не примет фото само по себе» (4 карточки: фон/пропорция/обрезка/текст).
- Компоненты: `components/landing/hero.tsx` (hero + гигантское число 9/10), `components/landing/how-it-works.tsx` (3 шага, нумерация уместна — последовательность), `components/upload/dropzone.tsx` (DragEvent+input, accept jpg/png/webp, превью первого файла через objectURL, счётчик файлов, суммарный и первый размер, «Очистить»), `components/upload/marketplace-picker.tsx` (`Marketplace = "wb"|"ozon"|"amazon"`, radiogroup, иконки ShoppingBag/Package/Globe, `value/onChange`, состояние в `page.tsx` через useState).
- Иконки только lucide-react (ShieldCheck, Upload, PackageCheck, ArrowRight, Hammer, ImageOff, Ruler, Crop, Type, FileImage, Trash2...). Фикс по ходу: `ScanCheck` нет в lucide-react 0.545.0 — заменён на `ShieldCheck`; убран круговой импорт типа `Marketplace`. Никаких стоковых картинок и эмодзи, переходы только `duration-200`.
- `docs/DECISIONS.md`: +1 строка про визуал «тёмный чертёж + один янтарь» (Manrope, graphite+amber, число-герой).
- Проверка: `pnpm build` — Compiled successfully, 6 роутов, First Load `/` 112 kB. `pnpm dev` + `curl --noproxy localhost:3000` — HTTP 200, 28 КБ, в разметке найдены все строки (hero, 9/10, WB/Ozon/Amazon, «Собрать карточку», оба блока). Интерактив кодом: dropzone обрабатывает onDrop/onChange с фильтром MIME, picker переключает `marketplace` через useState.
- Что видно (скриншотера в окружении нет, `docs/screens/landing.png` не создан — по T1 описан текстом): тёмный фон, бейдж «Валидатор регламента, а не фотостудия», заголовок «Карточку, которую площадка примет с первого раза», справа крупное «9/10», кнопки «Проверить своё фото» + «Посмотреть готовый пример», дропзона dashed, три карточки площадок (WB выбран, янтарная рамка), неактивная кнопка, три шага, четыре причины отказа.

## Что дальше
T2: клиент моделей + MOCK (раздел 6 MASTER.md; сначала открыть https://dev.meta.ai/docs и сверить поля; скиллы karpathy-guidelines, test-driven-development). Ссылка `/demo` в hero пока ведёт в 404 — появится в T7. shadcn/ui в T1 не инициализировался (для лендинга хватило Tailwind + токенов, лишний вес не тянули).

## Открытые вопросы
- Точные имена полей sam-3.1 и images/edits — сверить по документации в T2.
- Цифры в rules/*.json не подтверждены официальными страницами (verified: false).
- `pnpm lint` (next lint) не прогонялся; `pnpm build` проходит без ошибок типов.
- На что смотреть: дропзона пуста до выбора файлов (превью/счётчик появляются после); `/api/health` и `/api/stats` не тронуты.
