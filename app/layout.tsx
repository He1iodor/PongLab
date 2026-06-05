import "./globals.css";
import { Montserrat } from "next/font/google";
import Cursor from "@/components/Cursor";

const montserrat = Montserrat({
  subsets: ["latin", "cyrillic"],
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className={montserrat.className}>
         <Cursor />
        {children}
      </body>
    </html>
  );
}
