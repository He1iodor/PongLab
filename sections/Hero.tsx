{/* RIGHT (robot + energy ring) */}
<div className="hidden lg:flex justify-end items-center">
  <div className="relative w-full max-w-[650px] lg:ml-28 lg:mt-6 flex items-center justify-center">

    {/* ORBIT RING */}
    <div className="absolute w-[560px] h-[560px] orbit-spin">
      <div className="absolute inset-0 rounded-full orbit-ring blur-[2px] opacity-80" />
    </div>

    {/* SOFT GLOW */}
    <div className="absolute w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(143,91,255,0.15),transparent_65%)] blur-2xl" />

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
