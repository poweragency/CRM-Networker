/**
 * Barrel for the shared CRM foundation components. Screen agents import from
 * here (or the individual files). All build on the slice-1 `ui/` primitives,
 * design tokens and the server-only data layer.
 */
export { PageHeader, type PageHeaderProps, type Breadcrumb } from './page-header';
export {
  DataTable,
  type DataTableProps,
} from './data-table';
export {
  FilterBar,
  type FilterBarProps,
  type FilterConfig,
  type FilterOption,
} from './filter-bar';
export { TagInput, type TagInputProps } from './tag-input';
export { TagList, type TagListProps } from './tag-list';
export { StatusPill } from './status-pill';
export { EmptyState, type EmptyStateProps } from './empty-state';
export { ConfirmDialog, type ConfirmDialogProps } from './confirm-dialog';
export { FormSheet, type FormSheetProps } from './form-sheet';
export {
  Toaster,
  useToast,
  type ToastOptions,
  type ToastVariant,
} from './toaster';
export { RichTextEditor, type RichTextEditorProps } from './rich-text-editor';
export { RichTextViewer, type RichTextViewerProps } from './rich-text-viewer';
