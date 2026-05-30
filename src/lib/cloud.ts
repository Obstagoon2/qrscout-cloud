import { SubmissionRecord } from '@/types/submission';

interface CloudRow {
  id?: string | number;
  local_id?: string;
  team_number?: number | null;
  match_number?: number | null;
  scouter?: string | null;
  page_title?: string | null;
  submitted_at?: string | null;
  qr_payload?: string | null;
  fields?: SubmissionRecord['fields'] | null;
  record_data?: Record<string, unknown> | null;
}

function getCloudConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const table = import.meta.env.VITE_SUPABASE_TABLE || 'scouting_submissions';
  const submitFunction =
    import.meta.env.VITE_SUPABASE_SUBMIT_FUNCTION || 'scouting-submit';

  return {
    enabled: Boolean(url && key),
    url,
    key,
    table,
    submitFunction,
  };
}

function getHeaders() {
  const config = getCloudConfig();

  if (!config.url || !config.key) {
    throw new Error('Cloud sync is not configured.');
  }

  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    'Content-Type': 'application/json',
  };
}

function getFunctionHeaders() {
  const config = getCloudConfig();

  if (!config.url || !config.key) {
    throw new Error('Cloud sync is not configured.');
  }

  return {
    apikey: config.key,
    'Content-Type': 'application/json',
  };
}

function rowToSubmission(row: CloudRow): SubmissionRecord {
  return {
    localId: row.local_id || crypto.randomUUID(),
    remoteId: row.id != null ? String(row.id) : row.local_id,
    source: 'cloud',
    syncStatus: 'synced',
    createdAt: row.submitted_at || new Date().toISOString(),
    teamNumber: row.team_number ?? undefined,
    matchNumber: row.match_number ?? undefined,
    scouter: row.scouter ?? undefined,
    pageTitle: row.page_title || 'Cloud Sync',
    qrPayload: row.qr_payload || '',
    fields: row.fields || [],
    recordData: row.record_data || {},
  };
}

export function isCloudConfigured() {
  return getCloudConfig().enabled;
}

export async function submitSubmissionToCloud(record: SubmissionRecord) {
  const config = getCloudConfig();

  if (!config.url) {
    throw new Error('Missing VITE_SUPABASE_URL.');
  }

  const response = await fetch(
    `${config.url}/functions/v1/${config.submitFunction}`,
    {
      method: 'POST',
      headers: {
        ...getFunctionHeaders(),
      },
      body: JSON.stringify({
        localId: record.localId,
        teamNumber: record.teamNumber ?? null,
        matchNumber: record.matchNumber ?? null,
        scouter: record.scouter ?? null,
        pageTitle: record.pageTitle,
        createdAt: record.createdAt,
        qrPayload: record.qrPayload,
        fields: record.fields,
        recordData: record.recordData,
      }),
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Cloud submission failed.');
  }

  const row = (await response.json()) as CloudRow;
  return rowToSubmission(row);
}

export async function fetchCloudSubmissions() {
  const config = getCloudConfig();

  if (!config.url) {
    throw new Error('Missing VITE_SUPABASE_URL.');
  }

  const response = await fetch(
    `${config.url}/rest/v1/${config.table}?select=id,local_id,team_number,match_number,scouter,page_title,submitted_at,qr_payload,fields,record_data&order=submitted_at.desc`,
    {
      headers: getHeaders(),
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to load cloud submissions.');
  }

  const rows = (await response.json()) as CloudRow[];
  return rows.map(rowToSubmission);
}
