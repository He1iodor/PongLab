{/* RIGHT — ROBOT + ENERGY RING */}
<div className="hidden lg:flex justify-end items-center">
  <div className="relative w-full max-w-[650px] lg:ml-28 lg:mt-6 flex items-center justify-center">

    {/* OUTER GLOW */}
    <div className="absolute w-[580px] h-[580px] rounded-full bg-[#8F5BFF]/10 blur-[120px]" />

    {/* ORBIT SYSTEM */}
    <div className="absolute w-[560px] h-[560px] orbit-spin">

      {/* TRAIL */}
      <div className="absolute inset-0 rounded-full orbit-trail" />

      {/* CORE RING */}
      <div className="absolute inset-0 rounded-full orbit-core" />

      {/* ENERGY HIGHLIGHT */}
      <div className="absolute inset-0 rounded-full orbit-glow" />

    </div>

    {/* INNER SOFT LIGHT */}
    <div className="absolute w-[460px] h-[460px] rounded-full bg-[radial-gradient(circle,rgba(143,91,255,0.18),transparent_65%)] blur-2xl" />

    {/* ROBOT */}
    <Image
      src="/bot.png"
      alt="Robot Training"
      width={520}
      height={520}
      className="relative drop-shadow-[0_0_120px_rgba(107,48,206,.6)]"
    />
  </div>
</div>
