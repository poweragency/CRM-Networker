/**
 * Barrel for the /chiamate screen components. They build on the shared CRM
 * foundation (PageHeader, DataTable, FilterBar, FormSheet, StatusPill, KpiCard,
 * useToast, …), the slice-1 `ui/` primitives and the demo-safe calls data layer.
 */
export {
  CallsManager,
  type CallsManagerProps,
  type CallTargetOption,
} from './calls-manager';
export { CallFormSheet, type CallFormSheetProps } from './call-form-sheet';
export { CallStatsStrip, type CallStatsStripProps } from './call-stats-strip';
export {
  ProspectPicker,
  type ProspectPickerProps,
  type ProspectOption,
} from './prospect-picker';
export {
  callFormSchema,
  zodCallResolver,
  toFormValues,
  toCallInput,
  nowLocalInput,
  type CallFormValues,
} from './call-form-schema';
