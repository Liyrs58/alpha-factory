"use client";

import { useCallback, useEffect, useState } from "react";

const LS_KEY = "alpha-factory-intro-seen";
const VIDEO_SRC = "/demo/investor-pitch.mp4";

export function IntroPitchModal() {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(LS_KEY) === "1") {
        setReady(true);
        return;
      }
    } catch {
      /* private mode */
    }
    setOpen(true);
    setReady(true);
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(LS_KEY, "1");
    } catch {
      /* ignore */
    }
    setPlaying(false);
    setOpen(false);
  }, []);

  const watch = useCallback(() => setPlaying(true), []);
  const replay = useCallback(() => {
    setOpen(true);
    setPlaying(true);
  }, []);

  useEffect(() => {
    const onReplay = () => replay();
    window.addEventListener("af:watch-intro", onReplay);
    return () => window.removeEventListener("af:watch-intro", onReplay);
  }, [replay]);

  if (!ready || !open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="af-intro-title"
      data-qa="intro-pitch-modal"
    >
      <div className="w-full max-w-lg border border-paper/20 bg-charcoal p-5 shadow-lg">
        {!playing ? (
          <>
            <p className="font-formula text-[10px] tracking-[0.18em] text-mute">ALPHA FACTORY</p>
            <h2 id="af-intro-title" className="mt-2 text-[1.6rem] leading-tight font-semibold tracking-[-0.02em] text-paper">
              Want a ~35s product intro?
            </h2>
            <p className="mt-3 font-formula text-[12px] leading-relaxed text-mute">
              Proposer → critic → backtester → PM on a shipped OHLCV sample. Formulaic alphas, REFINE loop,
              paper-only. LIVE trading stays off.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                data-qa="intro-watch"
                onClick={watch}
                className="bg-signal px-3 py-2 font-formula text-[11px] tracking-[0.14em] text-charcoal uppercase"
              >
                Watch intro
              </button>
              <button
                type="button"
                data-qa="intro-skip"
                onClick={dismiss}
                className="border border-paper/30 bg-transparent px-3 py-2 font-formula text-[11px] tracking-[0.14em] text-paper uppercase"
              >
                Skip to app
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 id="af-intro-title" className="text-[1.25rem] font-semibold text-paper">
                Alpha Factory intro
              </h2>
              <button
                type="button"
                data-qa="intro-dismiss"
                onClick={dismiss}
                className="font-formula text-[11px] tracking-[0.14em] text-mute uppercase hover:text-paper"
              >
                Continue
              </button>
            </div>
            <video
              className="mt-3 w-full border border-paper/20 bg-black"
              src={VIDEO_SRC}
              controls
              autoPlay
              playsInline
              onEnded={dismiss}
            />
          </>
        )}
      </div>
    </div>
  );
}

export function watchIntroPitch() {
  window.dispatchEvent(new Event("af:watch-intro"));
}
