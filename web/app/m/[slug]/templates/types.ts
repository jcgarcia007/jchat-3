import type { PublicBusiness, PublicMenuCategory, PublicMenuItem } from "../page";

/**
 * The contract every menu template receives. Data + all state handlers that
 * live in MenuPageClient — templates render the browse UI and reuse this API
 * (never re-implement cart/customizer/pickup logic).
 */
export interface MenuTemplateProps {
  business: PublicBusiness;
  categories: PublicMenuCategory[];
  // Category navigation (scroll-spy)
  activeCategory: string;
  scrollToCategory: (catId: string) => void;
  sectionRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  // Cart
  onItemAdd: (item: PublicMenuItem) => void; // = handleItemAdd (opens customizer or adds directly)
  cartCount: number;
  cartTotal: number;
  onOpenCart: () => void; // = () => setStep("cart")
  // Card hover effect
  cardEffect: string;
  hoveredCardId: string | null;
  mousePos: { mx: number; my: number };
  onCardEnter: (e: React.MouseEvent<HTMLDivElement>, id: string) => void;
  onCardLeave: () => void;
  onCardMove: (e: React.MouseEvent<HTMLDivElement>, id: string) => void;
}
