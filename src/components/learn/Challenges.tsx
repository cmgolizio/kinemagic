"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CHALLENGES, type GradeOutcome } from "@/challenges/challenges";
import { useSimStore } from "@/store/simStore";

// ---------------------------------------------------------------------------
// localStorage ledgers as external stores (id → ISO date), hydration-safe:
// the server snapshot is empty, the client re-reads after mount. Two of
// them: challenges attempted (starting point loaded) and challenges solved.
// A solved stamp requires having attempted — the default mechanism passing
// a challenge you never touched earns nothing.
// ---------------------------------------------------------------------------

function makeLedger(key: string) {
  const listeners = new Set<() => void>();
  return {
    subscribe(cb: () => void): () => void {
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) cb();
      };
      listeners.add(cb);
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    getSnapshot(): string {
      try {
        return localStorage.getItem(key) ?? "{}";
      } catch {
        return "{}";
      }
    },
    getServerSnapshot(): string {
      return "{}";
    },
    write(next: Record<string, string>): void {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        return; // private mode etc. — live grading still works, it just won't persist
      }
      for (const l of listeners) l();
    },
  };
}

const solvedLedger = makeLedger("kinemagic-challenges-solved");
const attemptedLedger = makeLedger("kinemagic-challenges-attempted");

function parseLedger(json: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed !== null && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

const today = (): string => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------

function StatusBadge({ outcome }: { outcome: GradeOutcome }) {
  const [color, text] =
    outcome.kind === "pass"
      ? ["var(--ok)", "pass"]
      : outcome.kind === "fail"
        ? ["var(--warn)", "not yet"]
        : ["var(--ink-muted)", "wrong mechanism"];
  return (
    <span
      className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest"
      style={{ color }}
    >
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {text}
    </span>
  );
}

/**
 * The challenge board. Grades run live against whatever mechanism is in the
 * simulator store right now — load a starting point, tune on the sim sheet,
 * and the badge flips the moment the geometry crosses the target.
 */
export function Challenges() {
  const router = useRouter();
  const mech = useSimStore((s) => s.mech);
  const loadShared = useSimStore((s) => s.loadShared);
  const solvedJson = useSyncExternalStore(
    solvedLedger.subscribe,
    solvedLedger.getSnapshot,
    solvedLedger.getServerSnapshot,
  );
  const solved = useMemo(() => parseLedger(solvedJson), [solvedJson]);
  const attemptedJson = useSyncExternalStore(
    attemptedLedger.subscribe,
    attemptedLedger.getSnapshot,
    attemptedLedger.getServerSnapshot,
  );
  const attempted = useMemo(() => parseLedger(attemptedJson), [attemptedJson]);

  const graded = useMemo(
    () => CHALLENGES.map((ch) => ({ ch, outcome: ch.grade(mech) })),
    [mech],
  );

  useEffect(() => {
    const newly = graded.filter(
      ({ ch, outcome }) => outcome.kind === "pass" && attempted[ch.id] && !solved[ch.id],
    );
    if (newly.length === 0) return;
    const next = { ...solved };
    for (const { ch } of newly) next[ch.id] = today();
    solvedLedger.write(next);
  }, [graded, solved, attempted]);

  const attempt = (id: string) => {
    const ch = CHALLENGES.find((c) => c.id === id)!;
    if (!attempted[id]) attemptedLedger.write({ ...attempted, [id]: today() });
    loadShared(ch.start);
    router.push("/");
  };

  return (
    <div className="flex flex-col gap-3">
      {graded.map(({ ch, outcome }) => (
        <section
          key={ch.id}
          className={`border bg-surface p-4 ${
            ch.marquee ? "border-accent" : "border-surface-edge"
          }`}
        >
          <header className="flex items-start justify-between gap-3">
            <h3 className="font-mono text-sm font-semibold uppercase tracking-[0.15em]">
              {ch.marquee && (
                <span className="mr-1.5 text-accent" title="The marquee challenge">
                  ★
                </span>
              )}
              {ch.title}
            </h3>
            <div className="flex shrink-0 items-center gap-3">
              {solved[ch.id] && (
                <span
                  className="font-mono text-[10px] uppercase tracking-widest"
                  style={{ color: "var(--ok)" }}
                >
                  ☑ solved {solved[ch.id]}
                </span>
              )}
              <StatusBadge outcome={outcome} />
            </div>
          </header>

          <p className="mt-2 text-sm text-ink-muted">{ch.goal}</p>

          <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink-faint">
            {outcome.measured}
          </p>

          <details className="mt-2">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-accent">
              hint
            </summary>
            <p className="mt-1 text-xs text-ink-muted">{ch.hint}</p>
          </details>

          <button
            type="button"
            onClick={() => attempt(ch.id)}
            className="mt-3 border border-surface-edge px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-muted transition-colors hover:border-accent hover:text-accent"
          >
            ⚙ load starting point → simulator
          </button>
        </section>
      ))}
    </div>
  );
}
