import type { Metadata } from "next";
import "./globals.css";
import { Montserrat } from "next/font/google";

const montserrat = Montserrat({
  subsets: ["latin", "cyrillic"],
});

const siteTitle = "PongLab — тренировки по настольному теннису с роботом-тренажёром или тренером";
const siteDescription =
  "PongLab — автоматизированное пространство для самостоятельных тренировок по настольному теннису с роботом-тренажёром. Выберите студию и время в онлайн-календаре.";

export const metadata: Metadata = {
  metadataBase: new URL("https://ponglab.vercel.app"),
  title: {
    default: siteTitle,
    template: "%s | PongLab",
  },
  description: siteDescription,
  applicationName: "PongLab",
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "PongLab",
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
  },
  // Не задаём глобальные robots: X-Robots-Tag точечно управляет noindex
  // для служебных маршрутов в next.config.ts. Публичные страницы индексируются
  // по умолчанию, без конфликтующего meta robots="index, follow".
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className={montserrat.className}>{children}</body>
    </html>
  );
}
