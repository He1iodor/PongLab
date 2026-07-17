"use client";

import Hero from "./Hero";
import Practice from "./Practice";
import Improve from "./Improve";
import Schedule from "./Schedule";
import Hits from "./Hits";
import Features from "./Features";
import Comparison from "./Comparison";
import CTA from "./CTA";

export default function WhyPongLab() {
  return (
    <section className="relative w-full">
      {/* Background Grid */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/[0.04]" />

        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:90px_90px]" />

        <div className="absolute top-24 left-24 h-96 w-96 rounded-full bg-[#6B30CE]/15 blur-[180px]" />

        <div className="absolute bottom-0 right-0 h-[520px] w-[520px] rounded-full bg-[#8F5BFF]/10 blur-[220px]" />
      </div>

      <div className="relative z-10 mx-auto flex max-w-[1580px] flex-col gap-32 pb-24">

        <Hero />

        <Practice />

        <Improve />

        <Schedule />

        <Hits />

        <Features />

        <Comparison />

        <CTA />

      </div>
    </section>
  );
}