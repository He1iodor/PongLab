
"use client";

import { useRouter } from "next/navigation";

type BackButtonProps = {
  fallbackHref?: string;
  children?: React.ReactNode;
  className?: string;
};

export default function BackButton({
  fallbackHref = "/",
  children = "← Вернуться назад",
  className = "",
}: BackButtonProps) {
  const router = useRouter();

  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <button
      type="button"
      onClick={goBack}
      className={className}
    >
      {children}
    </button>
  );
}
