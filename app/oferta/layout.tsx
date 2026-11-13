import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Договор-оферта",
  description:
    "Публичная оферта PongLab на предоставление автоматизированного доступа к спортивной инфраструктуре и роботизированным пространствам настольного тенниса.",
  alternates: {
    canonical: "/oferta",
  },
  openGraph: {
    type: "article",
    url: "/oferta",
    title: "Договор-оферта | PongLab",
    description:
      "Условия предоставления автоматизированного доступа к спортивной инфраструктуре PongLab.",
  },
};

export default function OfertaLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
