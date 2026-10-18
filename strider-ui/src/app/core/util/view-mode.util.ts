import { ListMode, ViewMode } from '@app/core/models/view.types';

/** Tab order of the mode toggle. */
export const VIEW_MODES: readonly ViewMode[] = ['traces', 'spans', 'stats'];
export const DEFAULT_VIEW_MODE: ViewMode = 'traces';
export const MODE_QUERY_PARAM = 'mode';

const LIST_MODES: readonly ViewMode[] = ['traces', 'spans'];

export const isViewMode = (value: unknown): value is ViewMode =>
  typeof value === 'string' && (VIEW_MODES as readonly string[]).includes(value);

export const parseViewMode = (raw: string | undefined): ViewMode =>
  isViewMode(raw) ? raw : DEFAULT_VIEW_MODE;

export const isListMode = (mode: ViewMode): mode is ListMode => LIST_MODES.includes(mode);
