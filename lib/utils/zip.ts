import JSZip from "jszip";

// Сборка ZIP строго в браузере: сервер отдаёт файлы по одному
// (см. DECISIONS: не упираемся в лимиты ответа и памяти сервера).
export interface ZipFileInput {
  name: string;
  data: Uint8Array;
}

export async function buildZip(files: ZipFileInput[]): Promise<Blob> {
  if (files.length === 0) {
    throw new Error("В архиве нет файлов: сначала загрузите main.jpg и текст карточки.");
  }
  const seen = new Set<string>();
  for (const file of files) {
    if (file.name.length === 0) throw new Error("У файла в архиве пустое имя.");
    if (seen.has(file.name)) throw new Error(`Файл «${file.name}» добавлен в архив дважды.`);
    seen.add(file.name);
    if (file.data.length === 0) throw new Error(`Файл «${file.name}» пустой.`);
  }
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.data);
  }
  return zip.generateAsync({ type: "blob" });
}
