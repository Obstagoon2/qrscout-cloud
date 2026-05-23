import { produce } from 'immer';
import { cloneDeep } from 'lodash';
import configJson from '../../config/2026/config.json';
import {
  ActionTrackerInputData,
  Config,
  configSchema,
  InputBase,
} from '../components/inputs/BaseInputProps';
import { MatchData } from '../types/matchData';
import { Result } from '../types/result';
import { SubmissionField, SubmissionRecord } from '../types/submission';
import { createStore } from './createStore';

export type { Result };

/**
 * Generates field values for a config, including dynamic fields for action-tracker inputs.
 * For action-tracker, creates _count and _times fields for each action.
 */
function generateFieldValues(config: Config): { code: string; value: any }[] {
  const fieldValues: { code: string; value: any }[] = [];

  for (const section of config.sections) {
    for (const field of section.fields) {
      if (field.type === 'action-tracker') {
        // For action-tracker, generate _count and _times fields for each action
        const actionField = field as ActionTrackerInputData;
        for (const action of actionField.actions) {
          fieldValues.push({
            code: `${field.code}_${action.code}_count`,
            value: 0,
          });
          fieldValues.push({
            code: `${field.code}_${action.code}_times`,
            value: '',
          });
        }
      } else {
        // Standard field
        fieldValues.push({
          code: field.code,
          value: field.defaultValue,
        });
      }
    }
  }

  return fieldValues;
}

function getDefaultConfig(): Config {
  const config = configSchema.safeParse(configJson);
  if (!config.success) {
    console.error(config.error);
    throw new Error('Invalid config schema');
  }
  return config.data;
}

export function getConfig() {
  const configData = cloneDeep(useQRScoutState.getState().formData);
  return configData;
}

export interface QRScoutState {
  formData: Config;
  fieldValues: { code: string; value: any }[];
  showQR: boolean;
  matchData?: MatchData[];
  activePage: 'scout' | 'analysis';
  submissions: SubmissionRecord[];
  cloudSync: {
    isSyncing: boolean;
    lastSyncedAt?: string;
    lastError?: string;
  };
}

const initialState: QRScoutState = {
  formData: getDefaultConfig(),
  fieldValues: generateFieldValues(getDefaultConfig()),
  showQR: false,
  activePage: 'scout',
  submissions: [],
  cloudSync: {
    isSyncing: false,
  },
};

export const useQRScoutState = createStore<QRScoutState>(
  initialState,
  'qrScout',
  {
    version: 5,
    migrate: persistedState => ({
      ...initialState,
      ...(persistedState as Partial<QRScoutState>),
      activePage: (persistedState as Partial<QRScoutState>)?.activePage || 'scout',
      submissions: (persistedState as Partial<QRScoutState>)?.submissions || [],
      cloudSync: {
        isSyncing: false,
        lastSyncedAt: (persistedState as Partial<QRScoutState>)?.cloudSync?.lastSyncedAt,
        lastError: undefined,
      },
    }),
  },
);

export function resetToDefaultConfig() {
  useQRScoutState.setState(initialState);
}

export async function fetchConfigFromURL(url: string): Promise<Result<void>> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch config from URL: ${response.statusText}`,
      );
    }
    const configText = await response.text();
    return setConfig(configText);
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

export function updateValue(code: string, data: any) {
  useQRScoutState.setState(
    produce((state: QRScoutState) => {
      const field = state.fieldValues.find(f => f.code === code);
      if (field) {
        field.value = data;
      }
    }),
  );
}

export function getFieldValue(code: string) {
  return useQRScoutState.getState().fieldValues.find(f => f.code === code)
    ?.value;
}

export function resetFields() {
  window.dispatchEvent(new CustomEvent('resetFields', { detail: 'reset' }));
}

export function forceResetFields() {
  window.dispatchEvent(
    new CustomEvent('forceResetFields', { detail: 'forceReset' }),
  );
}

export function setFormData(config: Config) {
  const oldState = useQRScoutState.getState();
  forceResetFields();
  const newFieldValues = generateFieldValues(config);
  useQRScoutState.setState({
    ...oldState,
    fieldValues: newFieldValues,
    formData: config,
  });
}

export function setConfig(configText: string): Result<void> {
  let jsonData: any;
  try {
    jsonData = JSON.parse(configText);
  } catch (e: any) {
    return { success: false, error: e.message };
  }
  const c = configSchema.safeParse(jsonData);
  if (!c.success) {
    console.error(c.error);
    return { success: false, error: c.error };
  }
  setFormData(c.data);
  return { success: true, data: undefined };
}

export function inputSelector<T extends InputBase>(
  section: string,
  code: string,
): (state: QRScoutState) => T | undefined {
  return (state: QRScoutState) => {
    const formData = state.formData;
    const field = formData.sections
      .find(s => s.name === section)
      ?.fields.find(f => f.code === code);

    if (!field) {
      return undefined;
    }
    return field as T;
  };
}


export function setMatchData(matchData: MatchData[]) {
  useQRScoutState.setState({ matchData });
}

function serializeFieldValue(value: unknown) {
  if (value == null) {
    return { displayValue: '', numericValue: undefined as number | undefined };
  }

  if (typeof value === 'number') {
    return { displayValue: String(value), numericValue: value };
  }

  if (typeof value === 'boolean') {
    return { displayValue: value ? 'Yes' : 'No', numericValue: value ? 1 : 0 };
  }

  if (Array.isArray(value)) {
    return {
      displayValue: value.join(', '),
      numericValue: undefined as number | undefined,
    };
  }

  if (typeof value === 'object' && 'teamNumber' in value) {
    const teamValue = value as { teamNumber?: number; robotPosition?: string };
    return {
      displayValue: teamValue.robotPosition
        ? `${teamValue.teamNumber} (${teamValue.robotPosition})`
        : String(teamValue.teamNumber ?? ''),
      numericValue: teamValue.teamNumber,
    };
  }

  return {
    displayValue: String(value),
    numericValue: undefined as number | undefined,
  };
}

function expandFieldMetadata(
  config: Config,
): Omit<SubmissionField, 'value' | 'displayValue' | 'numericValue'>[] {
  return config.sections.flatMap(section =>
    section.fields.flatMap(field => {
      if (field.type === 'action-tracker') {
        const actionField = field as ActionTrackerInputData;
        return actionField.actions.flatMap(action => [
          {
            code: `${field.code}_${action.code}_count`,
            title: `${action.label} Count`,
            section: section.name,
            type: 'number' as const,
          },
          {
            code: `${field.code}_${action.code}_times`,
            title: `${action.label} Times`,
            section: section.name,
            type: 'text' as const,
          },
        ]);
      }

      return [
        {
          code: field.code,
          title: field.title,
          section: section.name,
          type: field.type,
        },
      ];
    }),
  );
}

function buildRecordData(fields: SubmissionField[]) {
  return Object.fromEntries(fields.map(field => [field.code, field.value]));
}

export function buildSubmissionRecord(): SubmissionRecord {
  const state = useQRScoutState.getState();
  const metadata = expandFieldMetadata(state.formData);
  const fieldMap = new Map(state.fieldValues.map(field => [field.code, field.value]));
  const fields = metadata.map(field => {
    const value = fieldMap.get(field.code);
    const { displayValue, numericValue } = serializeFieldValue(value);

    return {
      ...field,
      value,
      displayValue,
      numericValue,
    };
  });
  const recordData = buildRecordData(fields);
  const robotValue = recordData.robot as
    | { teamNumber?: number; robotPosition?: string }
    | undefined;

  return {
    localId: crypto.randomUUID(),
    source: 'local',
    syncStatus: 'pending',
    createdAt: new Date().toISOString(),
    teamNumber:
      robotValue?.teamNumber ||
      (typeof recordData.teamNumber === 'number'
        ? (recordData.teamNumber as number)
        : undefined),
    matchNumber:
      typeof recordData.matchNumber === 'number'
        ? (recordData.matchNumber as number)
        : undefined,
    scouter: typeof recordData.scouter === 'string' ? recordData.scouter : undefined,
    pageTitle: state.formData.page_title,
    qrPayload: state.fieldValues
      .map(field => serializeFieldValue(field.value).displayValue.replace(/\r\n|\r|\n/g, ' '))
      .join(state.formData.delimiter),
    fields,
    recordData,
  };
}

export function setActivePage(activePage: 'scout' | 'analysis') {
  useQRScoutState.setState({ activePage });
}

export function addSubmission(submission: SubmissionRecord) {
  useQRScoutState.setState(state => ({
    submissions: [
      submission,
      ...state.submissions.filter(existing => existing.localId !== submission.localId),
    ],
  }));
}

export function markSubmissionSynced(localId: string, remoteId?: string) {
  useQRScoutState.setState(state => ({
    submissions: state.submissions.map(submission =>
      submission.localId === localId
        ? {
            ...submission,
            remoteId: remoteId || submission.remoteId,
            syncStatus: 'synced',
          }
        : submission,
    ),
  }));
}

export function mergeCloudSubmissions(submissions: SubmissionRecord[]) {
  useQRScoutState.setState(state => {
    const merged = new Map<string, SubmissionRecord>();

    for (const submission of state.submissions) {
      merged.set(submission.remoteId || submission.localId, submission);
    }

    for (const submission of submissions) {
      const key = submission.remoteId || submission.localId;
      const existing = merged.get(key);
      merged.set(
        key,
        existing ? { ...existing, ...submission, syncStatus: 'synced' } : submission,
      );
    }

    return {
      submissions: Array.from(merged.values()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    };
  });
}

export function setCloudSyncState(
  updates: Partial<QRScoutState['cloudSync']>,
) {
  useQRScoutState.setState(state => ({
    cloudSync: {
      ...state.cloudSync,
      ...updates,
    },
  }));
}

export function clearCloudError() {
  useQRScoutState.setState(state => ({
    cloudSync: {
      ...state.cloudSync,
      lastError: undefined,
    },
  }));
}
