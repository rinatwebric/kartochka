import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "КАРТОЧКА — фото товара в карточку маркетплейса",
  description:
    "Загрузите фото товара с телефона и получите карточку для Wildberries, Ozon и Amazon, которую площадка примет с первого раза. Проверка по регламенту — 9 из 10 проверок автоматом.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="ru" className={`dark ${manrope.variable}`}>
      <body className="min-h-screen bg-ink-950 font-sans text-paper antialiased">
        {children}
      </body>
    </html>
  );
}
