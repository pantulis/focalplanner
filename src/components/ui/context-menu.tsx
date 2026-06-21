import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MenuNode {
  id: string;
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  children?: MenuNode[];
  separatorBefore?: boolean;
  danger?: boolean;
  /** Render a colored dot (e.g. calendar color). `null` shows a neutral dot. */
  colorDot?: string | null;
  /** Subdued trailing hint text (e.g. resolved date/time). */
  hint?: string;
  /** Small trailing badge text (e.g. "Current"). */
  pill?: string;
  disabled?: boolean;
}

const PAD = 6; // viewport padding

function SubMenu({
  anchorRef,
  items,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  items: MenuNode[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    left: "100%",
    top: 0,
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    const el = ref.current;
    const anchor = anchorRef.current;
    if (!el || !anchor) return;
    const a = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: open right unless it would overflow, then open left.
    const horiz: CSSProperties =
      a.right + w <= vw - PAD ? { left: "100%" } : { right: "100%" };

    // Vertical: align with row top, but shift up if it overflows the bottom.
    let top = 0;
    if (a.top + h > vh - PAD) {
      top = vh - PAD - (a.top + h);
      if (a.top + top < PAD) top = PAD - a.top; // clamp to viewport top
    }

    setStyle({ ...horiz, top, visibility: "visible" });
  }, [anchorRef]);

  return (
    <div ref={ref} className="absolute z-10 px-1" style={style}>
      <List items={items} onClose={onClose} />
    </div>
  );
}

function Row({
  item,
  open,
  onEnter,
  onClose,
}: {
  item: MenuNode;
  open: boolean;
  onEnter: () => void;
  onClose: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const hasChildren = !!item.children?.length;
  const Icon = item.icon;

  return (
    <>
      {item.separatorBefore && <div className="my-1 h-px bg-border" />}
      <div ref={rowRef} className="relative" onMouseEnter={onEnter}>
        <button
          disabled={item.disabled}
          onClick={() => {
            if (hasChildren || item.disabled) return;
            item.onSelect?.();
            onClose();
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm outline-none",
            "hover:bg-accent disabled:cursor-default",
            item.danger && "text-destructive",
          )}
        >
          {Icon && <Icon className={cn("size-3.5 shrink-0", item.disabled && "opacity-40")} />}
          {item.colorDot !== undefined && (
            <span
              className="size-2.5 shrink-0 rounded-full border border-black/10"
              style={{ backgroundColor: item.colorDot ?? "var(--muted-foreground)" }}
            />
          )}
          <span className={cn("flex-1 truncate", item.disabled && "text-muted-foreground")}>
            {item.label}
          </span>
          {item.pill && (
            <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-primary-foreground">
              {item.pill}
            </span>
          )}
          {item.hint && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {item.hint}
            </span>
          )}
          {hasChildren && <ChevronRight className="size-3.5 shrink-0 opacity-60" />}
        </button>

        {hasChildren && open && (
          <SubMenu anchorRef={rowRef} items={item.children!} onClose={onClose} />
        )}
      </div>
    </>
  );
}

function List({ items, onClose }: { items: MenuNode[]; onClose: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="min-w-44 max-w-64 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg">
      {items.map((item) => (
        <Row
          key={item.id}
          item={item}
          open={openId === item.id}
          onEnter={() => setOpenId(item.children?.length ? item.id : null)}
          onClose={onClose}
        />
      ))}
    </div>
  );
}

function RootMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuNode[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({
    left: x,
    top: y,
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = x + w > vw - PAD ? Math.max(PAD, vw - PAD - w) : x;
    const top = y + h > vh - PAD ? Math.max(PAD, vh - PAD - h) : y;
    setPos({ left, top, visibility: "visible" });
  }, [x, y]);

  return (
    <div
      ref={ref}
      className="absolute"
      style={pos}
      onClick={(e) => e.stopPropagation()}
    >
      <List items={items} onClose={onClose} />
    </div>
  );
}

interface Props {
  x: number;
  y: number;
  items: MenuNode[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <RootMenu x={x} y={y} items={items} onClose={onClose} />
    </div>,
    document.body,
  );
}
