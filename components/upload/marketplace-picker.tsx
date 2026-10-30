import { Globe, Package, ShoppingBag } from "lucide-react";

export type Marketplace = "wb" | "ozon" | "amazon";

export const MARKETPLACES: Array<{
  id: Marketplace;
  name: string;
  hint: string;
  icon: typeof ShoppingBag;
}> = [
  { id: "wb", name: "Wildberries", hint: "900 × 1200 · 3:4", icon: ShoppingBag },
  { id: "ozon", name: "Ozon", hint: "900 × 1200 · до 10 фото", icon: Package },
  { id: "amazon", name: "Amazon", hint: "2000 px · белый 255", icon: Globe },
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
            className={`flex items-center gap-3 rounded-card border p-4 text-left transition-colors duration-200 ${
              selected
                ? "border-accent bg-ink-800 shadow-lift"
                : "border-white/10 bg-ink-900 hover:border-white/25 hover:bg-ink-800"
            }`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control ${
                selected ? "bg-accent" : "bg-ink-700"
              }`}
            >
              <place.icon
                className={`h-5 w-5 ${selected ? "text-accent-ink" : "text-paper"}`}
                aria-hidden="true"
              />
            </span>
            <span>
              <span className="block font-bold">{place.name}</span>
              <span className="block text-xs text-muted">{place.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
