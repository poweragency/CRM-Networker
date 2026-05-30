/**
 * Barrel for the /sette-perche screen components. They build on the shared CRM
 * foundation (PageHeader, FormSheet, ConfirmDialog, EmptyState, useToast), the
 * slice-1 `ui/` primitives and the demo-safe seven-whys data layer.
 */
export {
  SevenWhysManager,
  type SevenWhysManagerProps,
} from './seven-whys-manager';
export {
  SevenWhysEditor,
  type SevenWhysEditorProps,
  type SevenWhysEditorHandle,
} from './seven-whys-editor';
export { SevenWhysDetail, type SevenWhysDetailProps } from './seven-whys-detail';
export {
  SevenWhysStepper,
  type SevenWhysStepperProps,
} from './seven-whys-stepper';
export { WhyProgress, type WhyProgressProps } from './why-progress';
export { PersonCard, type PersonCardProps } from './person-card';
export { WHY_STEPS, whyOrdinal, type WhyStep } from './why-prompts';
