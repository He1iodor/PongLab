
import type { Metadata } from "next";
import MiniAppClient from "./MiniAppClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PongLab — Telegram",
  robots: {
    index: false,
    follow: false,
  },
};

export default function MiniAppPage() {
  return <MiniAppClient />;
}
