/**
 * Barrel for the shared `ui/` primitives. Later slices may import individual
 * files directly (better tree-shaking) or pull from here for convenience.
 */
export { Button, buttonVariants, type ButtonProps } from './button';
export { Input, type InputProps } from './input';
export { Label, type LabelProps } from './label';
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card';
export { Badge, badgeVariants, type BadgeProps } from './badge';
export { Avatar, type AvatarProps } from './avatar';
export { Skeleton } from './skeleton';
export { Separator, type SeparatorProps } from './separator';
export { ScrollArea, type ScrollAreaProps } from './scroll-area';
export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  type TabsProps,
  type TabsTriggerProps,
  type TabsContentProps,
} from './tabs';
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  type DropdownMenuTriggerProps,
  type DropdownMenuContentProps,
  type DropdownMenuItemProps,
} from './dropdown-menu';
export { Tooltip, type TooltipProps } from './tooltip';
export { ThemeToggle } from './theme-toggle';
export { RankBadge, type RankBadgeProps } from './rank-badge';
export { StatusDot } from './status-dot';
