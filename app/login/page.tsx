
import type { Metadata } from "next";
import LoginPageClient from "./LoginPageClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Вход в PongLab",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginPage() {
  return <LoginPageClient />;
}
