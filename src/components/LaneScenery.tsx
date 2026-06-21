import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

type Kind = "bubble" | "cloud";

interface Particle {
  id: number;
  size: number;
  duration: number;
  opacity: number;
  // bubbles
  leftPct: number;
  drift: number;
  // clouds
  topPct: number;
  dir: "ltr" | "rtl";
  variant: number;
}

const CLOUDS = [
  // fluffy silhouettes (viewBox 0 0 60 30)
  <g key="0">
    <ellipse cx="30" cy="21" rx="24" ry="7" />
    <circle cx="19" cy="17" r="8" />
    <circle cx="32" cy="13" r="11" />
    <circle cx="44" cy="17" r="8" />
  </g>,
  <g key="1">
    <ellipse cx="30" cy="22" rx="22" ry="6" />
    <circle cx="22" cy="18" r="7" />
    <circle cx="34" cy="15" r="9" />
    <circle cx="44" cy="19" r="6" />
  </g>,
];

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Ambient backdrop: rising bubbles (deep water) or drifting clouds (sky). */
export function LaneScenery({ kind }: { kind: Kind }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [parts, setParts] = useState<Particle[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ready = kind === "bubble" ? box.h > 0 : box.w > 0;

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const max = kind === "bubble" ? 4 : 2;
    const spawn = () => {
      if (!alive) return;
      setParts((prev) => {
        if (prev.length >= max) return prev;
        return [
          ...prev,
          {
            id: nextId.current++,
            size: kind === "bubble" ? rand(7, 16) : rand(26, 56),
            duration: kind === "bubble" ? rand(5, 10) : rand(48, 82),
            opacity: kind === "bubble" ? rand(0.18, 0.36) : rand(0.06, 0.13),
            leftPct: rand(4, 92),
            drift: rand(2, 7),
            topPct: rand(4, 60),
            dir: Math.random() < 0.5 ? "ltr" : "rtl",
            variant: Math.floor(Math.random() * CLOUDS.length),
          },
        ];
      });
      timer = setTimeout(spawn, kind === "bubble" ? rand(1500, 5000) : rand(8000, 20000));
    };
    timer = setTimeout(spawn, rand(400, 4000));
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [ready, kind]);

  const remove = (id: number) => setParts((prev) => prev.filter((p) => p.id !== id));

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden text-foreground"
    >
      {parts.map((p) => {
        if (kind === "bubble") {
          return (
            <motion.div
              key={p.id}
              initial={{ y: 0, opacity: 0 }}
              animate={{
                y: -(box.h + p.size * 3),
                x: [0, p.drift, -p.drift, p.drift * 0.6, 0],
                opacity: [0, p.opacity, p.opacity, 0],
              }}
              transition={{ duration: p.duration, ease: "easeOut" }}
              onAnimationComplete={() => remove(p.id)}
              style={{ position: "absolute", bottom: 0, left: `${p.leftPct}%`, width: p.size, height: p.size }}
            >
              <svg viewBox="0 0 12 12" width={p.size} height={p.size}>
                <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="4.3" cy="4.3" r="1" fill="currentColor" />
              </svg>
            </motion.div>
          );
        }
        const pad = p.size * 1.2;
        const from = p.dir === "ltr" ? -pad : box.w + pad;
        const to = p.dir === "ltr" ? box.w + pad : -pad;
        return (
          <motion.div
            key={p.id}
            initial={{ x: from }}
            animate={{ x: to }}
            transition={{ duration: p.duration, ease: "linear" }}
            onAnimationComplete={() => remove(p.id)}
            style={{ position: "absolute", top: `${p.topPct}%`, opacity: p.opacity }}
          >
            <svg width={p.size} height={p.size * 0.5} viewBox="0 0 60 30" fill="currentColor">
              {CLOUDS[p.variant] ?? CLOUDS[0]}
            </svg>
          </motion.div>
        );
      })}
    </div>
  );
}
