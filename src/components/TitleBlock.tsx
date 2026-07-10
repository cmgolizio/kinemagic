export interface TitleBlockProps {
  /** Drawing title, e.g. "FOUR-BAR LINKAGE". */
  title: string;
  drawingNo?: string;
  sheet?: string;
}

/**
 * Engineering-drawing title block, stamped bottom-right of the sheet like
 * a real drafting sheet. Parent must be `position: relative`.
 */
export function TitleBlock({ title, drawingNo = "KM-001", sheet = "01" }: TitleBlockProps) {
  return (
    <div className="pointer-events-none absolute right-4 bottom-4 border border-line-faint bg-surface/85 font-mono text-[10px] uppercase leading-none text-ink backdrop-blur-[1px]">
      <div className="flex items-stretch divide-x divide-line-faint border-b border-line-faint">
        <div className="px-3 py-2 text-sm font-semibold tracking-[0.3em]">Kinemagic</div>
        <div className="flex flex-col justify-center gap-1 px-3 py-1.5 text-ink-muted">
          <span>dwg no. {drawingNo}</span>
          <span>rev A</span>
        </div>
      </div>
      <div className="flex items-stretch divide-x divide-line-faint">
        <div className="flex items-center px-3 py-1.5 tracking-[0.15em]">{title}</div>
        <div className="flex items-center px-3 py-1.5 text-ink-muted">scale 1:1</div>
        <div className="flex items-center px-3 py-1.5 text-ink-muted">units mm</div>
        <div className="flex items-center px-3 py-1.5 text-ink-muted">sheet {sheet}</div>
      </div>
    </div>
  );
}