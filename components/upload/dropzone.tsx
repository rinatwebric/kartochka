"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileImage, Trash2, Upload } from "lucide-react";

const ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}

function formatTotal(files: ReadonlyArray<File>): string {
  const total: number = files.reduce((sum, file) => sum + file.size, 0);
  return formatBytes(total);
}

export function Dropzone({
  onFiles,
}: {
  onFiles?: (files: Array<File>) => void;
}): React.ReactElement {
  const [files, setFiles] = useState<Array<File>>([]);
  const [dragging, setDragging] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = useCallback(
    (incoming: FileList | Array<File>): void => {
      const list: Array<File> = Array.from(incoming).filter((file) =>
        /image\/(jpeg|png|webp)/.test(file.type),
      );
      if (list.length === 0) return;
      setFiles((prev) => {
        const next = [...prev, ...list];
        onFiles?.(next);
        return next;
      });
    },
    [onFiles],
  );

  useEffect(() => {
    if (files.length === 0) {
      setPreviewUrl(null);
      return;
    }
    const first: File | undefined = files[0];
    if (first === undefined) return;
    const url: string = URL.createObjectURL(first);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [files]);

  const clearAll = useCallback((): void => {
    setFiles([]);
    onFiles?.([]);
  }, [onFiles]);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Зона загрузки фото товара"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event: React.DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event: React.DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-card border border-dashed px-6 py-10 text-center transition-colors duration-200 ${
          dragging
            ? "border-accent bg-ink-800"
            : "border-white/20 bg-ink-900 hover:border-white/35 hover:bg-ink-800"
        }`}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-control bg-ink-700">
          <Upload className="h-6 w-6 text-accent" aria-hidden="true" />
        </span>
        <p className="mt-4 font-bold">
          Перетащите фото сюда или нажмите для выбора
        </p>
        <p className="mt-1 text-sm text-muted">
          jpg, png, webp с телефона. Первое фото станет главным кадром.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            if (event.target.files !== null) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {files.length > 0 ? (
        <div className="mt-4 rounded-card border border-white/10 bg-ink-900 p-4">
          <div className="flex items-center gap-4">
            {previewUrl !== null ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={`Превью: ${files[0]?.name ?? "первый файл"}`}
                className="h-16 w-16 shrink-0 rounded-chip border border-white/10 object-cover"
              />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-chip bg-ink-700">
                <FileImage
                  className="h-6 w-6 text-muted"
                  aria-hidden="true"
                />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {files[0]?.name ?? "Файл"}
              </p>
              <p className="mt-1 text-sm text-muted tabular-nums">
                Файлов: {files.length} · {formatTotal(files)}
                {files.length > 1 && files[0] !== undefined
                  ? ` · первый ${formatBytes(files[0].size)}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-2 rounded-control border border-white/15 px-3 py-2 text-sm font-semibold text-muted transition-colors duration-200 hover:border-white/30 hover:text-paper"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Очистить
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
