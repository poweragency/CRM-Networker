/**
 * Barrel for the /contatti screen components. They build on the shared CRM
 * foundation (DataTable, FilterBar, FormSheet, ConfirmDialog, StatusPill, …),
 * the slice-1 `ui/` primitives and the demo-safe contacts data layer.
 */
export { ContactsManager, type ContactsManagerProps } from './contacts-manager';
export {
  ContactFormSheet,
  type ContactFormSheetProps,
} from './contact-form-sheet';
export {
  ContactDetailSheet,
  type ContactDetailSheetProps,
} from './contact-detail-sheet';
export { ContactBulkBar, type ContactBulkBarProps } from './contact-bulk-bar';
export {
  contactFormSchema,
  zodContactResolver,
  toFormValues,
  toContactInput,
  isoToLocalInput,
  localInputToIso,
  type ContactFormValues,
} from './contact-form-schema';
