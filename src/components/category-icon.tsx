import type { ComponentType } from "react";
import {
  BookOpen,
  BookmarkSimple,
  Briefcase,
  CalendarBlank,
  ChartBar,
  ChatCircleDots,
  Cloud,
  Code,
  Database,
  Folder,
  GameController,
  GlobeHemisphereWest,
  Heart,
  Image,
  Lightning,
  MagnifyingGlass,
  MusicNotes,
  PenNib,
  Play,
  Robot,
  ShoppingBag,
  Star,
  TerminalWindow,
  Wrench,
  type IconProps,
} from "@phosphor-icons/react";
import type { CategoryIcon as CategoryIconName } from "../types";

const icons: Record<CategoryIconName, ComponentType<IconProps>> = {
  "magnifying-glass": MagnifyingGlass,
  code: Code,
  "pen-nib": PenNib,
  play: Play,
  "book-open": BookOpen,
  briefcase: Briefcase,
  wrench: Wrench,
  folder: Folder,
  database: Database,
  terminal: TerminalWindow,
  cloud: Cloud,
  chat: ChatCircleDots,
  shopping: ShoppingBag,
  game: GameController,
  music: MusicNotes,
  image: Image,
  calendar: CalendarBlank,
  chart: ChartBar,
  robot: Robot,
  bookmark: BookmarkSimple,
  globe: GlobeHemisphereWest,
  lightning: Lightning,
  heart: Heart,
  star: Star,
};

interface CategoryIconProps extends IconProps {
  name: CategoryIconName;
}

export function CategoryIcon({ name, ...props }: CategoryIconProps) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" weight="regular" {...props} />;
}
