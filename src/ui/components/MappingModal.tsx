import { useEffect, useState } from 'react';
import { useUi } from '../../store/ui';
import { useGrid } from '../../store/project';
import { toast } from '../../store/toasts';
import { getOscBridge, bridgeLoad, connectDevBridge, DEFAULT_BRIDGE_URL, OSC_PROFILES, templateRows } from '../../bridge/oscBridge';
import { learnNextMidiNote, bindNoteToCell } from '../../bridge/bind';
import type { OscProfileId, OscRow } from '../../bridge/oscBridge';

const BRIDGE = getOscBridge();

export function MappingModal() {
  const open = useUi((s) => s.mappingOpen);
  const setOpen = useUi((s) => s.setMappingOpen);
  const midiSync = useUi((s) => s.midiSync);
  const setMidiSync = useUi((s) => s.setMidiSync);
  const selected = useGrid((s) => s.selected);
  const [profile, setProfile] = useState<OscProfileId>(() => BRIDGE.profile.id);
  const [url, setUrl] = useState(DEFAULT_BRIDGE_URL);
  const [connected, setConnected] = useState(() => BRIDGE.connected);
  const [rows, setRows] = useState<OscRow[]>(() => templateRows(BRIDGE.profile.id));

  useEffect(() => {
    if (!open || BRIDGE.connected) return;
    const attempt = url || DEFAULT_BRIDGE_URL;
    void connectDevBridge(BRIDGE, attempt)
      .then(() => { setConnected(true); toast.success('Dev bridge connected'); })
      .catch(() => { setConnected(false); toast.error('Dev bridge unreachable — run `node tools/osc-ws-bridge.mjs`'); });
  }, [open, url]);

  if (!open) return null;

  const changeProfile = (id: OscProfileId): void => {
    bridgeLoad(id, templateRows(id));
    setProfile(id);
    setRows(templateRows(id));
  };

  const updateRow = (i: number, patch: Partial<OscRow>): void => {
    const next = rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    setRows(next);
    bridgeLoad(profile, next);
  };

  const addRow = (): void => {
    const next = [...rows, { action: '', target: '' }];
    setRows(next);
    bridgeLoad(profile, next);
  };

  const connect = async (): Promise<void> => {
    try {
      await connectDevBridge(BRIDGE, url || DEFAULT_BRIDGE_URL);
      setConnected(true);
      toast.success('Dev bridge connected');
    } catch {
      setConnected(false);
      toast.error('Dev bridge unreachable — run `node tools/osc-ws-bridge.mjs`');
    }
  };

  const disconnect = (): void => {
    BRIDGE.transport?.dispose();
    BRIDGE.transport = null;
    setConnected(false);
    toast.info('Bridge disconnected');
  };

  const midiLearn = async (): Promise<void> => {
    const track = selected ? useGrid.getState().tracks.find((t) => t.id === useGrid.getState().cells[selected]?.trackId) : undefined;
    toast.info('MIDI learn: play/send a pad note…');
    try {
      const note = await learnNextMidiNote();
      if (selected && track) {
        bindNoteToCell(note, selected);
      } else {
        toast.info(`Note ${note} received — select a cell to bind it`);
      }
    } catch {
      toast.error('MIDI learn timed out');
    }
  };

  return (
    <div className="modal-backdrop" onPointerDown={() => setOpen(false)}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <h3>OSC / MIDI bridge</h3>

        <section className="modal__section">
          <h4>Transport</h4>
          <div className="modal__row">
            <span className={`badge${connected ? ' badge--ok' : ''}`}>{connected ? '● connected' : '○ offline'}</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ws://localhost:9001" />
            {connected
              ? <button className="btn" onClick={disconnect}>Disconnect</button>
              : <button className="btn" onClick={() => void connect()}>Connect</button>}
          </div>
          <div className="modal__row">
            <label className="modal__check">
              <input type="checkbox" checked={midiSync} onChange={(e) => setMidiSync(e.target.checked)} />
              Send/receive MIDI clock (24 ppq) — bridged to DAW
            </label>
          </div>
        </section>

        <section className="modal__section">
          <h4>Profile templates</h4>
          <label className="modal__row">
            Profile
            <select value={profile} onChange={(e) => changeProfile(e.target.value as OscProfileId)}>
              {Object.values(OSC_PROFILES).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          <div className="mapping__tables">
            {rows.map((row, i) => (
              <div key={i} className="mapping__row">
                <input value={row.action} placeholder="Action (e.g. Scene 3)" onChange={(e) => updateRow(i, { action: e.target.value })} />
                <input value={row.target} placeholder="OSC address" onChange={(e) => updateRow(i, { target: e.target.value })} />
              </div>
            ))}
          </div>

          <div className="modal__row">
            <button className="btn" onClick={addRow}>+ Row</button>
            <button className="btn" onClick={() => void midiLearn()}>MIDI learn</button>
          </div>
          <p className="modal__hint">Out: scene/play/stop are encoded to these addresses. In: incoming packets on these addresses trigger the same actions. Send &amp; receive are symmetric.</p>
        </section>

        <section className="modal__section">
          <h4>MIDI mapping</h4>
          <p className="modal__hint">Pads: 8 rows × 8 scenes from note 36 (Launchpad layout). Faders: track gain on CC 0–7. Velocity-0 acts as note-off. Bind a specific note with MIDI learn.</p>
        </section>

        <div className="modal__row">
          <button className="btn modal__close" onClick={() => setOpen(false)}>Done</button>
        </div>
      </div>
    </div>
  );
}