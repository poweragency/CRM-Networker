/**
 * Barrel for the /percorso-prospect (prospect journey) components. Builds on the
 * shared CRM foundation (FormSheet, StatusPill, useToast…) and the slice-1 `ui/`
 * primitives. Board interactions use @dnd-kit; all data arrives as plain props
 * from the RSC pages (the server-only data layer is never imported here).
 */
export { ProspectBoard, type ProspectBoardProps } from './prospect-board';
export { BoardColumn, type BoardColumnProps } from './board-column';
export {
  ProspectCard,
  ProspectCardBody,
  type ProspectCardProps,
} from './prospect-card';
export {
  NewProspectSheet,
  type NewProspectSheetProps,
  type ContactOption,
} from './new-prospect-sheet';
export { StageChanger, type StageChangerProps } from './stage-changer';
export {
  JourneyTimeline,
  type JourneyTimelineProps,
} from './journey-timeline';
export { ProspectCalls, type ProspectCallsProps } from './prospect-calls';
export { FunnelProgress, type FunnelProgressProps } from './funnel-progress';
export type { ProspectView, StageColumnView, BoardView } from './types';
