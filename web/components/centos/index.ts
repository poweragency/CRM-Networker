/**
 * Barrel for the /centos screen components. They build on the shared CRM
 * foundation (PageHeader, DataTable, FilterBar, FormSheet, ConfirmDialog,
 * StatusPill, …), the slice-1 `ui/` primitives and the demo-safe centos data
 * layer.
 */
export { CentosManager, type CentosManagerProps } from './centos-manager';
export {
  CentosFormSheet,
  type CentosFormSheetProps,
} from './centos-form-sheet';
export {
  CentosDetailSheet,
  type CentosDetailSheetProps,
} from './centos-detail-sheet';
export { RatingStars, type RatingStarsProps } from './rating-stars';
export {
  RatingStarsInput,
  type RatingStarsInputProps,
} from './rating-stars-input';
export {
  centosFormSchema,
  zodCentosResolver,
  toFormValues,
  toCentosInput,
  type CentosFormValues,
} from './centos-form-schema';
