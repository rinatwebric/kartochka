import { Globe, Package, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type Marketplace = "wb" | "ozon" | "amazon";

export const MARKETPLACES: Array<{
  id: Marketplace;
  name: string;
  hint: string;
  icon: typeof ShoppingBag;
  dot: string;
}> = [
  { id: "wb", name: "Wildberries", hint: "900 × 1200 · 3:4", icon: ShoppingBag, dot: "bg-wb" },
  { id: "ozon", name: "Ozon", hint: "900 × 1200 · до 10 фото", icon: Package, dot: "bg-ozon" },
  { id: "amazon", name: "Amazon", hint: "2000 px · белый 255", icon: Globe, dot: "bg-amazon" },
];

type MarketplacePickerProps = {
  value: Marketplace;
  onChange: (next: Marketplace) => void;
};

export function MarketplacePicker({
  value,
  onChange,
}: MarketplacePickerProps): React.ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label="Выбор площадки"
      className="grid gap-3 sm:grid-cols-3"
    >
      {MARKETPLACES.map((place) => {
        const selected: boolean = place.id === value;
        return (
          <button
            key={place.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(place.id)}
            className={cn(
              "flex items-center gap-3 rounded-card border p-4 text-left transition-colors duration-200",
              selected
                ? "border-accent/60 bg-accent/10 shadow-case"
                : "border-white/10 bg-ink-900 hover:border-lavender/40 hover:bg-ink-800",
            )}
          >
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-control",
                selected ? "bg-accent" : "bg-ink-700",
              )}
            >
              <place.icon
                className={cn(
                  "h-5 w-5",
                  selected ? "text-accent-ink" : "text-paper",
                )}
                aria-hidden="true"
              />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-bold">
                <span
                  aria-hidden="true"
                  className={cn("h-2 w-2 shrink-0 rounded-full", place.dot)}
                />
                {place.name}
              </span>
              <span className="block truncate text-xs text-muted tabular-nums">
                {place.hint}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
