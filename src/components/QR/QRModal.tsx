import { isCloudConfigured, submitSubmissionToCloud } from '@/lib/cloud';
import {
  addSubmission,
  buildSubmissionRecord,
  markSubmissionSynced,
  setCloudSyncState,
} from '@/store/store';
import { AlertTriangle, CheckCircle2, Copy, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useMemo, useState } from 'react';
import { getFieldValue, useQRScoutState } from '../../store/store';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { PreviewText } from './PreviewText';

function removeNewlines(value: string): string {
  return value.replace(/\r\n|\r|\n/g, ' ');
}

function fieldValueToQrString(value: unknown): string {
  if (value != null && typeof value === 'object' && 'teamNumber' in value) {
    const { teamNumber } = value as { teamNumber: number };
    return String(teamNumber);
  }
  if (value === null || value === undefined) return '';
  return removeNewlines(String(value));
}

export interface QRModalProps {
  disabled?: boolean;
}

export function QRModal(props: QRModalProps) {
  const fieldValues = useQRScoutState(state => state.fieldValues);
  const formData = useQRScoutState(state => state.formData);
  const [open, setOpen] = useState(false);
  const [submitState, setSubmitState] = useState<
    | { status: 'idle' }
    | { status: 'submitting' }
    | { status: 'synced'; qrData: string }
    | { status: 'fallback'; qrData: string; error: string }
  >({ status: 'idle' });
  const robotValue = getFieldValue('robot');
  const title = `${fieldValueToQrString(robotValue)} - M${getFieldValue(
    'matchNumber',
  )}`.toUpperCase();

  const qrCodeData = useMemo(
    () =>
      fieldValues
        .map(f => fieldValueToQrString(f.value))
        .join(formData.delimiter),
    [fieldValues, formData.delimiter],
  );
  const copyValue =
    submitState.status === 'synced' || submitState.status === 'fallback'
      ? submitState.qrData
      : qrCodeData;

  useEffect(() => {
    if (!open) {
      setSubmitState({ status: 'idle' });
      return;
    }

    let cancelled = false;

    async function submit() {
      const record = buildSubmissionRecord();
      addSubmission(record);

      if (!isCloudConfigured()) {
        setCloudSyncState({
          lastError: 'Cloud sync is not configured yet. Saved locally and opened QR fallback.',
        });
        if (!cancelled) {
          setSubmitState({
            status: 'fallback',
            qrData: record.qrPayload,
            error:
              'Cloud sync is not configured, so this submission is waiting for QR or a later retry.',
          });
        }
        return;
      }

      setSubmitState({ status: 'submitting' });
      setCloudSyncState({ isSyncing: true, lastError: undefined });

      try {
        const syncedRecord = await submitSubmissionToCloud(record);
        markSubmissionSynced(record.localId, syncedRecord.remoteId);
        setCloudSyncState({
          isSyncing: false,
          lastSyncedAt: new Date().toISOString(),
        });
        if (!cancelled) {
          setSubmitState({ status: 'synced', qrData: record.qrPayload });
        }
      } catch (error) {
        setCloudSyncState({
          isSyncing: false,
          lastError: error instanceof Error ? error.message : 'Cloud submission failed.',
        });
        if (!cancelled) {
          setSubmitState({
            status: 'fallback',
            qrData: record.qrPayload,
            error:
              error instanceof Error
                ? error.message
                : 'Cloud submission failed. Use the QR fallback for this record.',
          });
        }
      }
    }

    submit();

    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={props.disabled}>
          <QrCode className="size-5" />
          Commit
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[95%]">
        <DialogHeader>
          <DialogTitle className="text-center font-rhr-ns text-3xl tracking-wider text-primary">
            {title}
          </DialogTitle>
          <DialogDescription className="text-center">
            Cloud first, QR fallback. This record tries the cloud before showing the QR backup.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-6 overflow-y-scroll">
          {submitState.status === 'submitting' && (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-4 text-center">
              <div className="size-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
              <div>
                <div className="text-xl font-semibold">Sending to the cloud</div>
                <div className="text-sm text-muted-foreground">
                  If this does not work, the QR backup will appear automatically.
                </div>
              </div>
            </div>
          )}
          {submitState.status === 'synced' && (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-4 text-center">
              <CheckCircle2 className="size-16 text-primary" />
              <div>
                <div className="text-2xl font-semibold">Cloud save successful</div>
                <div className="text-sm text-muted-foreground">
                  This record is already stored remotely. You can still copy or scan the backup payload below.
                </div>
              </div>
              <div className="rounded-md bg-white p-4">
                <QRCodeSVG className="m-2 mt-4" size={220} value={submitState.qrData} />
              </div>
              <PreviewText data={submitState.qrData} />
            </div>
          )}
          {submitState.status === 'fallback' && (
            <>
              <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-700">
                <AlertTriangle className="size-5 shrink-0" />
                <span>{submitState.error}</span>
              </div>
              <div className="rounded-md bg-white p-4">
                <QRCodeSVG className="m-2 mt-4" size={256} value={submitState.qrData} />
              </div>
              <PreviewText data={submitState.qrData} />
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => navigator.clipboard.writeText(copyValue)}>
            <Copy className="size-4" /> Copy Data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
