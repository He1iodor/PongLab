"use client";

import { useRef, useState } from "react";
import { X, Play } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function HowItWorksModal({ open, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    video.play();
    setIsPlaying(true);
  };

  const handlePause = () => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    setIsPlaying(false);
  };

  if (!open) return null;

  return (
    <>
      {/* BACKDROP */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
        onClick={onClose}
      >
        <div
          className="relative w-[92%] max-w-5xl max-h-[90vh] overflow-y-auto hide-scrollbar rounded-3xl bg-[#0B0D18] border border-white/10 p-10 text-white"
          onClick={(e) => e.stopPropagation()}
        >
          {/* CLOSE */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 h-11 w-11 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center"
          >
            <X size={20} />
          </button>

          {/* TITLE */}
          <h2 className="text-4xl md:text-6xl font-black">
            Как работает PongLab
          </h2>

          <p className="mt-4 text-white/60 max-w-2xl">
            Роботизированная система тренировок, аналитики и развития игровых навыков.
          </p>

          {/* STEPS */}
          <div className="mt-10 grid md:grid-cols-3 gap-6">
            <div className="rounded-3xl bg-white/5 p-6">
              <div className="text-[#8F5BFF] font-bold">ШАГ 1</div>
              <h3 className="mt-3 text-xl font-bold">Анализ уровня</h3>
              <p className="mt-2 text-white/60">Система определяет текущий уровень игрока.</p>
            </div>

            <div className="rounded-3xl bg-white/5 p-6">
              <div className="text-[#8F5BFF] font-bold">ШАГ 2</div>
              <h3 className="mt-3 text-xl font-bold">Персональная программа</h3>
              <p className="mt-2 text-white/60">Формируется индивидуальная тренировка.</p>
            </div>

            <div className="rounded-3xl bg-white/5 p-6">
              <div className="text-[#8F5BFF] font-bold">ШАГ 3</div>
              <h3 className="mt-3 text-xl font-bold">Аналитика</h3>
              <p className="mt-2 text-white/60">Сохраняются данные и отслеживается прогресс.</p>
            </div>
          </div>

          {/* VIDEO */}
          <div className="mt-10 relative group">
            <video
              ref={videoRef}
              className="w-full aspect-video rounded-3xl border border-white/10 bg-black"
              src="/video.mp4"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />

            {/* OVERLAY PLAY BUTTON */}
            {!isPlaying && (
              <button
                onClick={handlePlay}
                className="
                  absolute inset-0
                  flex items-center justify-center
                  bg-black/40
                  rounded-3xl
                  transition
                  hover:bg-black/50
                "
              >
                <div className="h-20 w-20 rounded-full bg-[#8F5BFF] flex items-center justify-center shadow-lg hover:scale-105 transition">
                  <Play size={32} fill="white" />
                </div>
              </button>
            )}

            {/* CLICK TO PAUSE WHEN PLAYING */}
            {isPlaying && (
              <button
                onClick={handlePause}
                className="absolute inset-0 w-full h-full"
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
