import Link from "next/link";
import { ThemeToggle } from "./ui/ThemeToggle";

export function Header() {
  return (
    <header className="z-20 flex items-center justify-between border-b border-panel-border bg-panel px-4 py-2 backdrop-blur-sm">
      <Link
        href="/"
        className="font-mono text-sm font-semibold uppercase tracking-[0.2em] text-ink"
      >
        Kinemagic
        <span className="ml-2 hidden text-[10px] font-normal normal-case tracking-normal text-ink-faint sm:inline">
          planar mechanism simulator
        </span>
      </Link>
      <nav className="flex items-center gap-4 font-mono text-xs uppercase tracking-widest">
        <Link href="/learn" className="text-ink-muted transition-colors hover:text-ink">
          Learn
        </Link>
        <Link href="/gallery" className="text-ink-muted transition-colors hover:text-ink">
          Gallery
        </Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}