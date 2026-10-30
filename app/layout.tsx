import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "КАРТОЧКА",
  description: "Фото товара с телефона — в готовую карточку для маркетплейса.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
