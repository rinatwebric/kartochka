// Транслит для имён файлов в батч-архиве: латиница, цифры, дефисы.
// Та же таблица, что в components/studio/result-actions.tsx (там не трогаем,
// здесь копия для батча, чтобы не тянуть клиентский компонент в импорт).
const TRANSLIT: Record<string, string> = {
  "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
  "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
  "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
  "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
  "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
};

export function slugifyFileName(name: string): string {
  const lowered = name.toLowerCase().replace(/\.[a-z0-9]+$/, "");
  let out = "";
  for (const ch of lowered) {
    if (ch >= "a" && ch <= "z") out += ch;
    else if (ch >= "0" && ch <= "9") out += ch;
    else if (TRANSLIT[ch] !== undefined) out += TRANSLIT[ch];
    else if (ch === " " || ch === "-" || ch === "_") out += "-";
  }
  const slug = out.replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug.length > 0 ? slug : "photo";
}
