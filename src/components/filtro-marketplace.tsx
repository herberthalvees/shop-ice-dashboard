import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Store } from "lucide-react";
import { ROTULOS_MARKETPLACE, useMarketplace, type Marketplace } from "@/lib/marketplace-store";

export function FiltroMarketplace({ className }: { className?: string }) {
  const { marketplace, setMarketplace } = useMarketplace();
  return (
    <Select value={marketplace} onValueChange={(v) => setMarketplace(v as Marketplace)}>
      <SelectTrigger
        aria-label="Filtrar por marketplace"
        className={className ?? "w-full min-w-36 flex-1 sm:w-44 sm:flex-none"}
      >
        <Store className="mr-2 size-4 shrink-0 opacity-70" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todos">{ROTULOS_MARKETPLACE.todos}</SelectItem>
        <SelectItem value="shopee">{ROTULOS_MARKETPLACE.shopee}</SelectItem>
        <SelectItem value="tiktok">{ROTULOS_MARKETPLACE.tiktok}</SelectItem>
      </SelectContent>
    </Select>
  );
}