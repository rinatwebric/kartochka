# SKILLS — какие скиллы установлены, откуда и как переустановить

Установлено 22 скилла в двух местах:
  - .opencode/skills/            в проекте: работает в этом репозитории, коммитится в git;
  - C:\Users\user\.config\opencode\skills\   глобально: работает в любом проекте.

Проверка, что opencode их видит: открыть opencode в папке проекта и спросить
«перечисли доступные скиллы». Должно вернуться 22 имени.

## Источники

| Репозиторий | Что даёт | Звёзд |
|---|---|---|
| github.com/anthropics/skills | официальные скиллы Anthropic: дизайн, документы, QA | официальный |
| github.com/obra/superpowers | методология разработки агентами: планы, TDD, дебаг, ревью | топ по звёздам среди skills-репо |
| github.com/mattpocock/skills | инженерные скиллы «для реальных инженеров»: spec, tickets, implement, review | топ по звёздам |
| github.com/multica-ai/andrej-karpathy-skills | поведенческие правила против типичных ошибок LLM в коде | топ по звёздам |

Почему именно эти: первые — официальные и проверенные; вторые и третьи закрывают процесс (как агент
планирует, пишет, проверяет и сдаёт работу), а не только «как верстать»; четвёртый лечит самую частую
болезнь агентов — уверенный код без проверки.

## Список и назначение

### Дизайн и фронт
- frontend-design — как делать интерфейс, который не выглядит дефолтным. Главный скилл для T1, T6, T7.
- theme-factory — темы, токены, типографика.
- brand-guidelines — аккуратный цвет и шрифт в артефактах.
- canvas-design — картинки и постеры в png/pdf (обложка, превью для поста).
- web-artifacts-builder — тяжёлые многокомпонентные HTML-артефакты, резерв.

### Проверка и QA
- webapp-testing — Playwright: клики, формы, скриншоты, проверка состояний. Использовать в T7 и T9.
- verification-before-completion — запрет говорить «готово» без доказательства. В конце каждой задачи.

### Процесс разработки
- brainstorming — разбор фичи до кода. Только на старте крупных задач.
- writing-plans — план до первой строки кода.
- executing-plans — исполнение плана по шагам с отметками.
- test-driven-development — тест раньше кода. Для identity, rules, whitebg, phash/ssim.
- systematic-debugging — 4 фазы: понять, локализовать, доказать, починить. Для непонятных багов.
- diagnosing-bugs — цикл диагностики сложных багов и регрессий.
- code-review — ревью по двум осям: стандарты репо и соответствие спеке.
- requesting-code-review / receiving-code-review — как просить и как принимать замечания.
- karpathy-guidelines — правила против типичных ошибок LLM в коде.

### Спецификации и передача
- to-spec — разговор превратить в спецификацию.
- to-tickets — спеку разбить на тикеты с критериями приёмки.
- implement — реализовать по спеке/тикету.
- handoff — сжать контекст в HANDOFF для следующего чата. В конце каждой задачи.
- skill-creator — если агенту не хватает своего скилла под проект.

## Как переустановить с нуля

```bash
mkdir -p skill-src && cd skill-src
git clone --depth 1 https://github.com/anthropics/skills anthropic
git clone --depth 1 https://github.com/obra/superpowers superpowers
git clone --depth 1 https://github.com/mattpocock/skills mp
git clone --depth 1 https://github.com/multica-ai/andrej-karpathy-skills karpathy
# дальше скопировать нужные папки в .opencode/skills/ и в ~/.config/opencode/skills/
```

## Требования opencode к скиллу

Папка .opencode/skills/<name>/SKILL.md, в начале YAML с полями name и description.
name обязан совпадать с именем папки и подходить под ^[a-z0-9]+(-[a-z0-9]+)*$.
description 1-1024 символа, по нему агент решает, когда скилл включать.
