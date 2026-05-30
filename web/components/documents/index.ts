/**
 * Barrel for the /documenti (internal knowledge base) screen components. The
 * page (RSC) reads the document set + tag universe + resolved author names via
 * the demo-safe data layer and renders {@link DocumentsWorkspace}; everything
 * interactive (library, reader/editor pane, metadata form, version history)
 * lives in the modules re-exported here.
 */
export {
  DocumentsWorkspace,
  type DocumentsWorkspaceProps,
} from './documents-workspace';
export { DocumentLibrary, type DocumentLibraryProps } from './document-library';
export { DocumentPane, type DocumentPaneProps } from './document-pane';
export { DocumentEditor, type DocumentEditorProps } from './document-editor';
export {
  DocumentFormSheet,
  type DocumentFormSheetProps,
  type DocumentFormValues,
} from './document-form-sheet';
export {
  VersionHistorySheet,
  type VersionHistorySheetProps,
} from './version-history-sheet';
