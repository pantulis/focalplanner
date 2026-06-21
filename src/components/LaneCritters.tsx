import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

type Kind = "bird" | "fish";

interface Critter {
  id: number;
  topPct: number;
  size: number;
  duration: number;
  opacity: number;
  variant: number;
  bob: number;
  flap: number;
  xs: number[]; // x waypoints (px)
  xTimes?: number[];
  faceXs: number[]; // scaleX per keyframe (fish); length 1 = constant facing
  faceTimes?: number[];
}

// Stroked silhouettes (viewBox 0 0 40 20). Gulls = two wing arcs.
const BIRDS = [
  "M2 12 Q 11 3 20 11 Q 29 3 38 12",
  "M2 11 Q 11 6 20 10 Q 29 6 38 11",
  "M3 13 Q 11 2 20 12 Q 29 2 37 13",
];
// Filled fish (head to the left, tail on the right).
const FISH = [
  "M31 10 C 25 3 10 3 5 10 C 10 17 25 17 31 10 Z M31 10 L 39 5 L 39 15 Z",
  "M29 10 C 22 4 11 4 6 10 C 11 16 22 16 29 10 Z M29 10 L 38 6 L 38 14 Z",
  "M32 10 C 24 2 9 2 4 10 C 9 18 24 18 32 10 Z M32 10 L 40 4 L 40 16 Z",
];

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Sparse, randomized silhouettes drifting across a lane. Fish occasionally
 *  turn around; birds always fly straight. */
export function LaneCritters({ kind }: { kind: Kind }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [critters, setCritters] = useState<Critter[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (width === 0) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const spawn = () => {
      if (!alive) return;
      setCritters((prev) => {
        if (prev.length >= 2) return prev; // sparse — never a carousel
        const size = kind === "bird" ? rand(22, 46) : rand(16, 40);
        const pad = size * 1.6;
        const enterLeft = Math.random() < 0.5;
        const from = enterLeft ? -pad : width + pad;

        let xs: number[];
        let xTimes: number[] | undefined;
        let faceXs: number[];
        let faceTimes: number[] | undefined;

        if (kind === "fish" && Math.random() < 0.45) {
          // Swim in, turn, and head back out the way it came.
          const mid = rand(width * 0.3, width * 0.7);
          xs = [from, mid, from];
          xTimes = [0, 0.5, 1];
          const faceIn = mid - from > 0 ? -1 : 1;
          faceXs = [faceIn, faceIn, -faceIn, -faceIn];
          faceTimes = [0, 0.47, 0.53, 1];
        } else {
          const to = enterLeft ? width + pad : -pad;
          xs = [from, to];
          faceXs = [kind === "fish" ? (to - from > 0 ? -1 : 1) : 1];
        }

        return [
          ...prev,
          {
            id: nextId.current++,
            topPct: rand(6, 76),
            size,
            duration: kind === "bird" ? rand(7, 14) : rand(12, 24),
            opacity: rand(0.1, 0.22),
            variant: Math.floor(Math.random() * (kind === "bird" ? BIRDS : FISH).length),
            bob: rand(1.4, 2.6),
            flap: kind === "bird" ? rand(0.4, 0.7) : rand(1.6, 2.8),
            xs,
            xTimes,
            faceXs,
            faceTimes,
          },
        ];
      });
      timer = setTimeout(spawn, rand(3500, 12000)); // long, random gaps
    };
    timer = setTimeout(spawn, rand(500, 5000));
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [width, kind]);

  const remove = (id: number) => setCritters((prev) => prev.filter((c) => c.id !== id));

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden text-foreground"
    >
      {critters.map((c) => {
        const paths = kind === "bird" ? BIRDS : FISH;
        const turning = c.faceXs.length > 1;
        return (
          <motion.div
            key={c.id}
            initial={{ x: c.xs[0] }}
            animate={{ x: c.xs }}
            transition={{ duration: c.duration, ease: kind === "fish" ? "easeInOut" : "linear", times: c.xTimes }}
            onAnimationComplete={() => remove(c.id)}
            style={{ position: "absolute", top: `${c.topPct}%`, opacity: c.opacity }}
          >
            <motion.div
              animate={{ y: [0, -4, 0, 4, 0] }}
              transition={{ duration: c.bob, repeat: Infinity, ease: "easeInOut" }}
            >
              <motion.svg
                width={c.size}
                height={c.size * 0.5}
                viewBox="0 0 40 20"
                fill={kind === "fish" ? "currentColor" : "none"}
                stroke={kind === "bird" ? "currentColor" : "none"}
                strokeWidth={kind === "bird" ? 2 : 0}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={kind === "fish" ? { scaleX: c.faceXs[0] } : undefined}
                style={kind === "fish" && !turning ? { scaleX: c.faceXs[0] } : undefined}
                animate={
                  kind === "bird"
                    ? { scaleY: [1, 0.6, 1] }
                    : turning
                      ? { scaleX: c.faceXs, rotate: [-3, 3, -3] }
                      : { rotate: [-3, 3, -3] }
                }
                transition={
                  kind === "bird"
                    ? { duration: c.flap, repeat: Infinity, ease: "easeInOut" }
                    : turning
                      ? {
                          scaleX: { duration: c.duration, times: c.faceTimes, ease: "easeInOut" },
                          rotate: { duration: c.flap, repeat: Infinity, ease: "easeInOut" },
                        }
                      : { duration: c.flap, repeat: Infinity, ease: "easeInOut" }
                }
              >
                <path d={paths[c.variant] ?? paths[0]} />
              </motion.svg>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}
