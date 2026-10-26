
"use client";

import { useRouter } from "next/navigation";
import BookingCalendar from "@/components/BookingCalendar";

export default function BookingPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#0B0D18] px-4 py-10 text-white sm:px-6 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mb-6 text-sm text-[#C8B2FF] hover:text-white"
        >
          ← На главную
        </button>

        <h1 className="mb-6 text-2xl font-bold sm:text-4xl">
          Создать бронь
        </h1>

        <BookingCalendar />
      </div>
    </main>
  );
}
