
"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import PersonalAccountModal from "@/components/PersonalAccountModal";

export default function LoginPageClient() {
  const router = useRouter();

  const returnTo = useCallback(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "returnTo",
    );

    let destination = "/miniapp";

    if (
      requested &&
      requested.startsWith("/") &&
      !requested.startsWith("//") &&
      !requested.includes("\\")
    ) {
      try {
        const url = new URL(requested, window.location.origin);

        if (url.origin === window.location.origin) {
          destination = `${url.pathname}${url.search}${url.hash}`;
        }
      } catch {
        destination = "/miniapp";
      }
    }

    router.replace(destination);
  }, [router]);

  return (
    <main className="min-h-[100dvh] bg-[#090B18]">
      <PersonalAccountModal
        open={true}
        onClose={returnTo}
        onAuthenticated={returnTo}
      />
    </main>
  );
}
