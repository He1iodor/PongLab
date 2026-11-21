
"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import PersonalAccountModal from "@/components/PersonalAccountModal";

export default function LoginPageClient() {
  const router = useRouter();

  const returnToMiniApp = useCallback(() => {
    router.replace("/miniapp");
  }, [router]);

  return (
    <main className="min-h-[100dvh] bg-[#090B18]">
      <PersonalAccountModal
        open={true}
        onClose={returnToMiniApp}
        onAuthenticated={returnToMiniApp}
      />
    </main>
  );
}
