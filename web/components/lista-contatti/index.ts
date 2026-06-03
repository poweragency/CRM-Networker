/**
 * Barrel for the /lista-contatti screen components. They build on the shared CRM
 * foundation (PageHeader, DataTable, FilterBar, FormSheet, ConfirmDialog,
 * StatusPill, …), the slice-1 `ui/` primitives and the demo-safe lista contatti data
 * layer.
 */
export { ListaContattiManager, type ListaContattiManagerProps } from './lista-contatti-manager';
export {
  ListaContattiFormSheet,
  type ListaContattiFormSheetProps,
} from './lista-contatti-form-sheet';
export {
  ListaContattiDetailSheet,
  type ListaContattiDetailSheetProps,
} from './lista-contatti-detail-sheet';
export { RatingStars, type RatingStarsProps } from './rating-stars';
export {
  RatingStarsInput,
  type RatingStarsInputProps,
} from './rating-stars-input';
export {
  listaContattiFormSchema,
  zodListaContattiResolver,
  toFormValues,
  toListaContattiInput,
  type ListaContattiFormValues,
} from './lista-contatti-form-schema';
