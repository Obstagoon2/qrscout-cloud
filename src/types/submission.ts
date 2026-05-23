export type SubmissionFieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'range'
  | 'select'
  | 'counter'
  | 'multi-counter'
  | 'timer'
  | 'multi-select'
  | 'checkbox-select'
  | 'image'
  | 'action-tracker'
  | 'TBA-team-and-robot'
  | 'TBA-match-number';

export interface SubmissionField {
  code: string;
  title: string;
  section: string;
  type: SubmissionFieldType;
  value: unknown;
  displayValue: string;
  numericValue?: number;
}

export interface SubmissionRecord {
  localId: string;
  remoteId?: string;
  source: 'local' | 'cloud';
  syncStatus: 'synced' | 'pending';
  createdAt: string;
  teamNumber?: number;
  matchNumber?: number;
  scouter?: string;
  pageTitle: string;
  qrPayload: string;
  fields: SubmissionField[];
  recordData: Record<string, unknown>;
}
