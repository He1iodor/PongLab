import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Hero from "@/sections/Hero";

export const metadata: Metadata = {
  title: "Настольный теннис с роботом-тренажёром",
  description:
    "Тренируйтесь в PongLab: роботизированная подача мячей, самостоятельная практика и онлайн-выбор студии и времени тренировки.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: "Настольный теннис с роботом-тренажёром | PongLab",
    description:
      "Роботизированные тренировки по настольному теннису. Выберите студию и время в онлайн-календаре PongLab.",
  },
};

export default function HomePage() {
  return (
    <>
      <Navbar />
      <Hero />
    </>
  );
}
