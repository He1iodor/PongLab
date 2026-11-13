import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Как работает PongLab",
  description:
    "Узнайте, как устроена тренировка по настольному теннису с роботом: автоматическая подача мячей, повторение игровых элементов и работа над техникой.",
  alternates: {
    canonical: "/how-it-works",
  },
  openGraph: {
    type: "website",
    url: "/how-it-works",
    title: "Как работает PongLab",
    description:
      "Принцип тренировок по настольному теннису с роботом-тренажёром PongLab.",
  },
};

export default function HowItWorksLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
