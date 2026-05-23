import { fetchCloudSubmissions, isCloudConfigured, submitSubmissionToCloud } from '@/lib/cloud';
import { cn } from '@/lib/utils';
import {
  clearCloudError,
  markSubmissionSynced,
  mergeCloudSubmissions,
  setCloudSyncState,
  useQRScoutState,
} from '@/store/store';
import { SubmissionField, SubmissionRecord } from '@/types/submission';
import { BarChart3, Cloud, CloudOff, RefreshCcw, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';

interface TeamAggregate {
  teamNumber: number;
  matches: number;
  averageScore: number;
  numericAverages: Record<string, number>;
  latestRecord: SubmissionRecord;
}

function formatDisplayValue(value: unknown) {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') {
    if ('teamNumber' in value) {
      const teamValue = value as { teamNumber?: number; robotPosition?: string };
      return teamValue.robotPosition
        ? `${teamValue.teamNumber} (${teamValue.robotPosition})`
        : `${teamValue.teamNumber ?? ''}`;
    }
    return JSON.stringify(value);
  }
  return value == null ? '' : String(value);
}

function isMetricField(field: SubmissionField) {
  return typeof field.numericValue === 'number' && !/match|team/i.test(field.code);
}

function buildDefaultWeights(records: SubmissionRecord[]) {
  const weights: Record<string, number> = {};
  records
    .flatMap(record => record.fields)
    .filter(isMetricField)
    .forEach(field => {
      if (!(field.code in weights)) {
        weights[field.code] = field.section === 'Prematch' ? 0 : 1;
      }
    });
  return weights;
}

function computeTeamAggregates(
  records: SubmissionRecord[],
  weights: Record<string, number>,
) {
  const grouped = new Map<number, SubmissionRecord[]>();
  for (const record of records) {
    if (!record.teamNumber) continue;
    const current = grouped.get(record.teamNumber) || [];
    current.push(record);
    grouped.set(record.teamNumber, current);
  }

  return Array.from(grouped.entries())
    .map(([teamNumber, teamRecords]) => {
      const numericTotals: Record<string, number> = {};
      const numericCounts: Record<string, number> = {};

      for (const record of teamRecords) {
        for (const field of record.fields) {
          if (typeof field.numericValue !== 'number') continue;
          numericTotals[field.code] = (numericTotals[field.code] || 0) + field.numericValue;
          numericCounts[field.code] = (numericCounts[field.code] || 0) + 1;
        }
      }

      const numericAverages = Object.fromEntries(
        Object.entries(numericTotals).map(([code, total]) => [
          code,
          total / (numericCounts[code] || 1),
        ]),
      );

      let scoreNumerator = 0;
      let scoreDenominator = 0;

      for (const [code, weight] of Object.entries(weights)) {
        const value = numericAverages[code];
        if (weight > 0 && Number.isFinite(value)) {
          scoreNumerator += value * weight;
          scoreDenominator += weight;
        }
      }

      return {
        teamNumber,
        matches: teamRecords.length,
        averageScore: scoreDenominator > 0 ? scoreNumerator / scoreDenominator : 0,
        numericAverages,
        latestRecord: [...teamRecords].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        )[0],
      } satisfies TeamAggregate;
    })
    .sort((a, b) => b.averageScore - a.averageScore);
}

export function AnalysisDashboard() {
  const submissions = useQRScoutState(state => state.submissions);
  const cloudSync = useQRScoutState(state => state.cloudSync);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [selectedTeam, setSelectedTeam] = useState<TeamAggregate | null>(null);

  const allRecords = useMemo(
    () => [...submissions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [submissions],
  );
  const pendingRecords = allRecords.filter(record => record.syncStatus === 'pending');
  const syncedRecords = allRecords.filter(record => record.syncStatus === 'synced');

  const metricFields = useMemo(() => {
    const seen = new Map<string, SubmissionField>();
    for (const record of allRecords) {
      for (const field of record.fields.filter(isMetricField)) {
        if (!seen.has(field.code)) seen.set(field.code, field);
      }
    }
    return Array.from(seen.values());
  }, [allRecords]);

  const resolvedWeights = useMemo(() => {
    const defaults = buildDefaultWeights(allRecords);
    return { ...defaults, ...weights };
  }, [allRecords, weights]);

  const teamAggregates = useMemo(
    () => computeTeamAggregates(syncedRecords.length ? syncedRecords : allRecords, resolvedWeights),
    [allRecords, resolvedWeights, syncedRecords],
  );

  async function refreshCloudData() {
    if (!isCloudConfigured()) {
      setCloudSyncState({
        lastError: 'Cloud sync is not configured yet. Add your Supabase values to .env.',
      });
      return;
    }

    clearCloudError();
    setCloudSyncState({ isSyncing: true });
    try {
      const remoteRecords = await fetchCloudSubmissions();
      mergeCloudSubmissions(remoteRecords);
      setCloudSyncState({ isSyncing: false, lastSyncedAt: new Date().toISOString() });
    } catch (error) {
      setCloudSyncState({
        isSyncing: false,
        lastError: error instanceof Error ? error.message : 'Cloud refresh failed.',
      });
    }
  }

  async function retryPending() {
    if (!isCloudConfigured()) {
      setCloudSyncState({
        lastError: 'Cloud sync is not configured yet. Add your Supabase values to .env.',
      });
      return;
    }

    clearCloudError();
    setCloudSyncState({ isSyncing: true });

    try {
      for (const record of pendingRecords) {
        const syncedRecord = await submitSubmissionToCloud(record);
        markSubmissionSynced(record.localId, syncedRecord.remoteId);
      }

      const remoteRecords = await fetchCloudSubmissions();
      mergeCloudSubmissions(remoteRecords);
      setCloudSyncState({ isSyncing: false, lastSyncedAt: new Date().toISOString() });
    } catch (error) {
      setCloudSyncState({
        isSyncing: false,
        lastError: error instanceof Error ? error.message : 'Retry failed.',
      });
    }
  }

  return (
    <div className="w-full max-w-7xl space-y-6 px-4 pb-8">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Records</CardTitle>
          </CardHeader>
          <CardContent className="text-4xl font-rhr text-primary">{allRecords.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Teams</CardTitle>
          </CardHeader>
          <CardContent className="text-4xl font-rhr text-primary">{teamAggregates.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pending QR Fallbacks</CardTitle>
          </CardHeader>
          <CardContent className="text-4xl font-rhr text-primary">{pendingRecords.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cloud Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {isCloudConfigured() ? (
                <Cloud className="size-4 text-primary" />
              ) : (
                <CloudOff className="size-4 text-destructive" />
              )}
              <span>{isCloudConfigured() ? 'Configured' : 'Not configured'}</span>
            </div>
            {cloudSync.lastSyncedAt && (
              <div className="text-xs text-muted-foreground">
                Last sync: {new Date(cloudSync.lastSyncedAt).toLocaleString()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-4" />
            Analysis Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button onClick={refreshCloudData} disabled={cloudSync.isSyncing}>
              <RefreshCcw className={cn('size-4', cloudSync.isSyncing && 'animate-spin')} />
              Refresh Cloud
            </Button>
            <Button
              variant="secondary"
              onClick={retryPending}
              disabled={!pendingRecords.length || cloudSync.isSyncing}
            >
              <Upload className="size-4" />
              Retry Pending
            </Button>
          </div>
          {cloudSync.lastError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {cloudSync.lastError}
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {metricFields.map(field => (
              <label key={field.code} className="rounded-lg border bg-card px-3 py-2 text-left">
                <div className="text-sm font-medium">{field.title}</div>
                <div className="mb-2 text-xs text-muted-foreground">{field.section}</div>
                <Input
                  type="number"
                  step="0.1"
                  value={resolvedWeights[field.code] ?? 0}
                  onChange={event =>
                    setWeights(current => ({
                      ...current,
                      [field.code]: Number(event.target.value) || 0,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Rankings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {teamAggregates.length === 0 && (
              <div className="text-sm text-muted-foreground">
                No synced records yet. Submit scouting data or refresh from the cloud.
              </div>
            )}
            {teamAggregates.map((team, index) => (
              <button
                key={team.teamNumber}
                type="button"
                onClick={() => setSelectedTeam(team)}
                className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition hover:border-primary"
              >
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Rank {index + 1}
                  </div>
                  <div className="font-rhr text-3xl text-primary">{team.teamNumber}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold">{team.averageScore.toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">{team.matches} matches</div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Submissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {allRecords.slice(0, 12).map(record => (
              <div key={`${record.localId}-${record.remoteId || 'local'}`} className="rounded-lg border px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium">
                      Team {record.teamNumber ?? 'Unknown'} | Match {record.matchNumber ?? '-'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(record.createdAt).toLocaleString()} by {record.scouter || 'Unknown'}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'rounded-full px-2 py-1 text-xs font-medium',
                      record.syncStatus === 'synced'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-amber-500/10 text-amber-700',
                    )}
                  >
                    {record.syncStatus === 'synced' ? 'Cloud saved' : 'QR fallback'}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team Table</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Matches</th>
                {metricFields.slice(0, 6).map(field => (
                  <th key={field.code} className="px-3 py-2">
                    {field.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamAggregates.map(team => (
                <tr
                  key={team.teamNumber}
                  className="cursor-pointer border-b transition hover:bg-muted/50"
                  onClick={() => setSelectedTeam(team)}
                >
                  <td className="px-3 py-2 font-semibold text-primary">{team.teamNumber}</td>
                  <td className="px-3 py-2">{team.averageScore.toFixed(2)}</td>
                  <td className="px-3 py-2">{team.matches}</td>
                  {metricFields.slice(0, 6).map(field => (
                    <td key={field.code} className="px-3 py-2">
                      {team.numericAverages[field.code]?.toFixed(2) ?? '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedTeam)} onOpenChange={() => setSelectedTeam(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {selectedTeam && (
            <>
              <DialogHeader>
                <DialogTitle className="font-rhr text-4xl text-primary">
                  Team {selectedTeam.teamNumber}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle>Weighted Score</CardTitle>
                  </CardHeader>
                  <CardContent className="text-3xl font-rhr text-primary">
                    {selectedTeam.averageScore.toFixed(2)}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Matches</CardTitle>
                  </CardHeader>
                  <CardContent className="text-3xl font-rhr text-primary">
                    {selectedTeam.matches}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Scouter</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold">
                    {selectedTeam.latestRecord.scouter || '-'}
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Latest Record</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  {selectedTeam.latestRecord.fields.map(field => (
                    <div key={field.code} className="rounded-lg border px-3 py-2">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {field.section}
                      </div>
                      <div className="font-medium">{field.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatDisplayValue(field.value) || '-'}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
