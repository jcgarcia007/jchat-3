"use client";

import Classic from "./Classic";
import LeftDrawer from "./LeftDrawer";
import IconRail from "./IconRail";
import StickyTabs from "./StickyTabs";
import CategorySidebar from "./CategorySidebar";
import StoreSections from "./StoreSections";
import GlassChips from "./GlassChips";
import InfiniteFeed from "./InfiniteFeed";
import Magazine from "./Magazine";
import StreamingRows from "./StreamingRows";
import MasonrySearch from "./MasonrySearch";
import FullscreenType from "./FullscreenType";
import Timeline from "./Timeline";
import Luxury from "./Luxury";
import Carousel from "./Carousel";
import Immersive from "./Immersive";
import Stories from "./Stories";
import CardStack from "./CardStack";
import Gesture from "./Gesture";
import AiPersonalized from "./AiPersonalized";
import BottomNav from "./BottomNav";
import Bento from "./Bento";
import HeroList from "./HeroList";
import SplitDiagonal from "./SplitDiagonal";
import Polaroid from "./Polaroid";
import Catalog from "./Catalog";
import type { MenuTemplateProps } from "./types";

/**
 * Routes menu_template_id to its template component. Non-ported ids fall back
 * to "classic" (JChat's current default layout).
 */
export default function MenuTemplateRenderer({
  templateId,
  ...props
}: MenuTemplateProps & { templateId: string }) {
  switch (templateId) {
    case "classic":
      return <Classic {...props} />;
    case "left-drawer":
      return <LeftDrawer {...props} />;
    case "icon-rail":
      return <IconRail {...props} />;
    case "sticky-tabs":
      return <StickyTabs {...props} />;
    case "category-sidebar":
      return <CategorySidebar {...props} />;
    case "store-sections":
      return <StoreSections {...props} />;
    case "glass-chips":
      return <GlassChips {...props} />;
    case "infinite-feed":
      return <InfiniteFeed {...props} />;
    case "magazine":
      return <Magazine {...props} />;
    case "streaming-rows":
      return <StreamingRows {...props} />;
    case "masonry-search":
      return <MasonrySearch {...props} />;
    case "fullscreen-type":
      return <FullscreenType {...props} />;
    case "timeline":
      return <Timeline {...props} />;
    case "luxury":
      return <Luxury {...props} />;
    case "carousel":
      return <Carousel {...props} />;
    case "immersive":
      return <Immersive {...props} />;
    case "stories":
      return <Stories {...props} />;
    case "card-stack":
      return <CardStack {...props} />;
    case "gesture":
      return <Gesture {...props} />;
    case "ai-personalized":
      return <AiPersonalized {...props} />;
    case "bottom-nav":
      return <BottomNav {...props} />;
    case "bento":
      return <Bento {...props} />;
    case "hero-list":
      return <HeroList {...props} />;
    case "split-diagonal":
      return <SplitDiagonal {...props} />;
    case "polaroid":
      return <Polaroid {...props} />;
    case "catalog":
      return <Catalog {...props} />;
    default:
      return <Classic {...props} />;
  }
}
