import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowCounterClockwise,
  ClockCounterClockwise,
  DownloadSimple,
  FloppyDisk,
  Gear,
  PencilSimple,
  Trash,
  UploadSimple,
  WarningCircle,
} from '@phosphor-icons/react';
import { Badge, Button, TextField } from '@/ui/components';
import { formatGameDate } from '@/game/clock/gameClock';
import {
  AUTOSAVE_SLOT_ID,
  saveService,
  type AutosaveConfig,
  type SaveSlotInfo,
} from '@/game/persistence';

type Notice = { tone: 'success' | 'error'; message: string } | null;

type ConfirmState =
  | { kind: 'load'; slotId: string; name: string }
  | { kind: 'delete'; slotId: string; name: string }
  | { kind: 'overwrite'; slotId: string; name: string }
  | { kind: 'import'; slotId: string; fileName: string; content: string }
  | null;

const INTERVAL_OPTIONS = [
  { label: '1 simulated minute', value: 60_000 },
  { label: '5 simulated minutes', value: 5 * 60_000 },
  { label: '15 simulated minutes', value: 15 * 60_000 },
  { label: '30 simulated minutes', value: 30 * 60_000 },
  { label: '1 simulated hour', value: 60 * 60_000 },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatRealDate(ts: number | null): string {
  if (!ts) return '�?"';
  return new Date(ts).toLocaleString();
}

export function SaveLoadSection() {
  const [slots, setSlots] = useState<SaveSlotInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [saveName, setSaveName] = useState('New Save');
  const [renameTarget, setRenameTarget] = useState<{ slotId: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [autosave, setAutosave] = useState<AutosaveConfig>(saveService.getAutosaveConfig());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importTargetSlot, setImportTargetSlot] = useState<string>('slot-1');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await saveService.listSlots();
      setSlots(next);
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to read save slots.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const manualSlots = useMemo(() => slots.filter((slot) => slot.kind === 'manual'), [slots]);
  const autosaveSlot = useMemo(() => slots.find((slot) => slot.kind === 'autosave') ?? null, [slots]);
  const status = saveService.getStatus();

  const firstEmptyManualSlot = useMemo(
    () => manualSlots.find((slot) => slot.record === null)?.slotId ?? null,
    [manualSlots],
  );

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      await refresh();
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The operation failed.',
      });
    } finally {
      setBusy(false);
    }
  };

  const saveToNewSlot = (): void => {
    if (!firstEmptyManualSlot) {
      setNotice({ tone: 'error', message: 'No empty save slot is available.' });
      return;
    }
    void run(async () => {
      await saveService.saveToSlot(firstEmptyManualSlot, saveName || 'Save');
      setNotice({ tone: 'success', message: 'Game saved to a new slot.' });
    });
  };

  const requestOverwrite = (slotId: string, currentName: string): void => {
    setConfirm({ kind: 'overwrite', slotId, name: currentName || saveName || 'Save' });
  };

  const requestLoad = (slotId: string, name: string): void => {
    setConfirm({ kind: 'load', slotId, name });
  };

  const requestDelete = (slotId: string, name: string): void => {
    setConfirm({ kind: 'delete', slotId, name });
  };

  const confirmAction = async (): Promise<void> => {
    if (!confirm) return;
    const action = confirm;
    setConfirm(null);

    if (action.kind === 'overwrite') {
      await run(async () => {
        await saveService.saveToSlot(action.slotId, saveName || action.name, { allowOverwrite: true });
        setNotice({ tone: 'success', message: 'Save overwritten successfully.' });
      });
      return;
    }

    if (action.kind === 'load') {
      await run(async () => {
        await saveService.loadFromSlot(action.slotId);
        setNotice({ tone: 'success', message: 'Save loaded. The simulation is paused — resume when ready.' });
      });
      return;
    }

    if (action.kind === 'delete') {
      await run(async () => {
        await saveService.deleteSlot(action.slotId);
        setNotice({ tone: 'success', message: 'Save deleted.' });
      });
      return;
    }

    if (action.kind === 'import') {
      await run(async () => {
        await saveService.importFromJson(action.content, action.slotId, action.fileName.replace(/\.json$/i, '') || 'Imported Save');
        setNotice({ tone: 'success', message: 'Archive imported into a new slot.' });
      });
    }
  };

  const beginRename = (slotId: string, name: string): void => {
    setRenameTarget({ slotId, name });
    setRenameValue(name);
  };

  const commitRename = async (): Promise<void> => {
    if (!renameTarget) return;
    const target = renameTarget;
    setRenameTarget(null);
    await run(async () => {
      await saveService.renameSlot(target.slotId, renameValue);
      setNotice({ tone: 'success', message: 'Save renamed.' });
    });
  };

  const exportSlot = async (slotId: string, name: string): Promise<void> => {
    await run(async () => {
      const json = await saveService.exportSlotAsJson(slotId);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${name.replace(/[^a-z0-9_-]+/gi, '_') || 'aethrion-save'}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice({ tone: 'success', message: 'Save exported as a JSON archive.' });
    });
  };

  const onImportFile = async (file: File | null): Promise<void> => {
    if (!file) return;
    try {
      const content = await file.text();
      setConfirm({ kind: 'import', slotId: importTargetSlot, fileName: file.name, content });
    } catch {
      setNotice({ tone: 'error', message: 'The selected file could not be read.' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const updateAutosave = (next: Partial<AutosaveConfig>): void => {
    const config = saveService.setAutosaveConfig(next);
    setAutosave(config);
    saveService.resetAutosaveTimer();
  };

  return (
    <section className="section-block" aria-label="Save and load">
      <h2 className="section-title">
        <FloppyDisk size={18} aria-hidden="true" /> Save &amp; Load
      </h2>

      <div className="save-manager">
        <div className="save-toolbar panel">
          <TextField
            label="Save name"
            value={saveName}
            onChange={(event) => setSaveName(event.target.value)}
            placeholder="New Save"
            hint="Used when creating or overwriting a save."
          />
          <div className="save-toolbar-actions">
            <Button size="sm" variant="primary" onClick={saveToNewSlot} disabled={busy || !firstEmptyManualSlot}>
              <FloppyDisk size={14} aria-hidden="true" /> Save to new slot
            </Button>
          </div>
        </div>

        <div className="panel autosave-panel" aria-label="Autosave settings">
          <h3 className="tech-group-title">
            <Gear size={14} aria-hidden="true" /> Autosave
          </h3>
          <div className="autosave-controls">
            <label className="field field--inline">
              <span className="field-label">Enable autosave</span>
              <input
                type="checkbox"
                checked={autosave.enabled}
                onChange={(event) => updateAutosave({ enabled: event.target.checked })}
              />
            </label>
            <div className="field">
              <label className="field-label" htmlFor="autosave-interval">Autosave interval</label>
              <select
                id="autosave-interval"
                className="field-input"
                value={autosave.intervalSimMs}
                onChange={(event) => updateAutosave({ intervalSimMs: Number(event.target.value) })}
              >
                {INTERVAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="tech-meta">
            <span>
              <ClockCounterClockwise size={12} aria-hidden="true" /> Last autosave:{' '}
              {formatRealDate(status.lastAutosaveAt)}
            </span>
            <span>
              <FloppyDisk size={12} aria-hidden="true" /> Last save: {formatRealDate(status.lastSaveAt)}
            </span>
            {status.lastAutosaveError ? (
              <span className="text-warning">
                <WarningCircle size={12} aria-hidden="true" /> {status.lastAutosaveError}
              </span>
            ) : null}
          </div>
        </div>

        <div className="panel" aria-label="Import archive">
          <h3 className="tech-group-title">
            <UploadSimple size={14} aria-hidden="true" /> Import archive
          </h3>
          <div className="autosave-controls">
            <div className="field">
              <label className="field-label" htmlFor="import-slot">Restore into slot</label>
              <select
                id="import-slot"
                className="field-input"
                value={importTargetSlot}
                onChange={(event) => setImportTargetSlot(event.target.value)}
              >
                {manualSlots
                  .filter((slot) => slot.record === null)
                  .map((slot) => (
                    <option key={slot.slotId} value={slot.slotId}>
                      {slot.slotId}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="import-file">Archive file</label>
              <input
                ref={fileInputRef}
                id="import-file"
                className="field-input"
                type="file"
                accept="application/json,.json"
                onChange={(event) => void onImportFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <p className="field-hint">Archives are validated before import and restored into an empty slot.</p>
        </div>

        <h3 className="tech-group-title">Save slots</h3>
        {loading ? (
          <p className="tech-description">Loading save slots�?�</p>
        ) : (
          <div className="save-slot-list" role="list">
            {manualSlots.map((slot) => (
              <SlotCard
                key={slot.slotId}
                slot={slot}
                busy={busy}
                onSave={() =>
                  slot.record
                    ? requestOverwrite(slot.slotId, slot.record.name)
                    : void run(async () => {
                        await saveService.saveToSlot(slot.slotId, saveName || 'Save');
                        setNotice({ tone: 'success', message: 'Game saved.' });
                      })
                }
                onLoad={() => slot.record && requestLoad(slot.slotId, slot.record.name)}
                onRename={() => slot.record && beginRename(slot.slotId, slot.record.name)}
                onDelete={() => slot.record && requestDelete(slot.slotId, slot.record.name)}
                onExport={() => slot.record && void exportSlot(slot.slotId, slot.record.name)}
              />
            ))}
            {autosaveSlot ? (
              <SlotCard
                slot={autosaveSlot}
                busy={busy}
                onSave={() =>
                  void run(async () => {
                    await saveService.saveToSlot(AUTOSAVE_SLOT_ID, 'Autosave', { allowOverwrite: true });
                    setNotice({ tone: 'success', message: 'Autosave updated.' });
                  })
                }
                onLoad={() => autosaveSlot.record && requestLoad(AUTOSAVE_SLOT_ID, autosaveSlot.record.name)}
                onRename={() => undefined}
                onDelete={() => autosaveSlot.record && requestDelete(AUTOSAVE_SLOT_ID, autosaveSlot.record.name)}
                onExport={() => autosaveSlot.record && void exportSlot(AUTOSAVE_SLOT_ID, autosaveSlot.record.name)}
                isAutosave
              />
            ) : null}
          </div>
        )}

        {renameTarget ? (
          <div className="panel save-confirm" role="dialog" aria-label="Rename save">
            <h3 className="tech-group-title">
              <PencilSimple size={14} aria-hidden="true" /> Rename save
            </h3>
            <TextField label="New name" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
            <div className="tech-actions">
              <Button size="sm" variant="primary" onClick={() => void commitRename()} disabled={busy}>
                Rename
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRenameTarget(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {confirm ? (
          <div className="panel save-confirm" role="alertdialog" aria-label="Confirm action">
            <h3 className="tech-group-title">
              <WarningCircle size={14} aria-hidden="true" /> Confirm action
            </h3>
            <p className="tech-description">
              {confirm.kind === 'load' &&
                `Loading "${confirm.name}" will replace the current active game. Unsaved progress will be lost. The simulation will be restored paused.`}
              {confirm.kind === 'delete' && `Delete "${confirm.name}"? This cannot be undone.`}
              {confirm.kind === 'overwrite' && `Overwrite the save in ${confirm.slotId} with "${confirm.name}"? The previous record will be kept as a backup.`}
              {confirm.kind === 'import' &&
                `Import "${confirm.fileName}" into ${confirm.slotId}? The archive will be validated before it is restored.`}
            </p>
            <div className="tech-actions">
              <Button size="sm" variant={confirm.kind === 'delete' ? 'danger' : 'primary'} onClick={() => void confirmAction()} disabled={busy}>
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {notice ? (
          <p
            className={`hiring-feedback ${notice.tone === 'error' ? 'hiring-feedback--error' : 'hiring-feedback--success'}`}
            role={notice.tone === 'error' ? 'alert' : 'status'}
          >
            {notice.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function SlotCard({
  slot,
  busy,
  onSave,
  onLoad,
  onRename,
  onDelete,
  onExport,
  isAutosave = false,
}: {
  slot: SaveSlotInfo;
  busy: boolean;
  onSave: () => void;
  onLoad: () => void;
  onRename: () => void;
  onDelete: () => void;
  onExport: () => void;
  isAutosave?: boolean;
}) {
  const record = slot.record;

  return (
    <article className="save-slot panel" role="listitem" aria-label={`${slot.slotId} ${record ? record.name : 'empty'}`}>
      <header className="order-head">
        <span className="order-name">{record ? record.name : 'Empty slot'}</span>
        <div className="event-badges">
          <Badge variant={record ? 'ok' : 'pending'}>{slot.slotId}</Badge>
          {isAutosave ? <Badge variant="brand">autosave</Badge> : null}
        </div>
      </header>

      {record ? (
        <div className="tech-meta">
          <span>
            <ClockCounterClockwise size={12} aria-hidden="true" /> {formatRealDate(record.updatedAt)}
          </span>
          <span>Sim {formatGameDate(record.simulatedDate)}</span>
          <span>Tick {record.tick}</span>
          <span>
            <Archive size={12} aria-hidden="true" /> {formatBytes(record.payloadBytes)}
          </span>
        </div>
      ) : (
        <p className="tech-description">No save stored in this slot.</p>
      )}

      <div className="tech-actions">
        <Button size="sm" variant="primary" onClick={onSave} disabled={busy}>
          <FloppyDisk size={12} aria-hidden="true" /> Save
        </Button>
        <Button size="sm" variant="secondary" onClick={onLoad} disabled={busy || !record}>
          <ArrowCounterClockwise size={12} aria-hidden="true" /> Load
        </Button>
        {!isAutosave ? (
          <Button size="sm" variant="ghost" onClick={onRename} disabled={busy || !record}>
            <PencilSimple size={12} aria-hidden="true" /> Rename
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onExport} disabled={busy || !record}>
          <DownloadSimple size={12} aria-hidden="true" /> Export
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete} disabled={busy || !record}>
          <Trash size={12} aria-hidden="true" /> Delete
        </Button>
      </div>
    </article>
  );
}