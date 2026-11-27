import Link from "next/link";
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#090B18]">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pb-3 pt-4 sm:px-6">
        <Link href="/admin" className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65 hover:bg-white/[0.05]">
          Панель владельца
        </Link>
        <Link href="/admin/passes" className="rounded-lg border border-violet-400/25 px-3 py-2 text-xs text-violet-100 hover:bg-violet-400/[0.08]">
          Абонементы
        </Link>
        <Link href="/admin/services" className="rounded-lg border border-violet-400/25 px-3 py-2 text-xs text-violet-100 hover:bg-violet-400/[0.08]">
          Дополнительные услуги
        </Link>
      </nav>
      {children}
    </div>
  );
}
