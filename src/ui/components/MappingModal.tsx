import { useState } from 'react';
import { useUi } from '../../store/ui';
import { toast } from '../../store/toasts';

/** M2 placeholder: profile selector + template shell.
 *  Wired to real OSC/MIDI in M4 (src/bridge). */
const PROFILES = ['Ableton Live', 'Reaper', 'Custom'];

interface TemplateRow {
  action: string;
  target: string;
}

export function MappingModal() {
  const open = useUi((s) => s.mappingOpen);
  const setOpen = useUi((s) => s.setMappingOpen);
  const [profile, setProfile] = useState(PROFILES[0]);
  const [rows, setRows] = useState<TemplateRow[]>([
    { action: 'Scene 1', target: '/scene/1' },
  ]);

  if (!open) return null;

  const addRow = (): void => setRows((r) => [...r, { action: '', target: '' }]);
  const update = (i: number, p: Partial<TemplateRow>): void =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...p } : row)));

  return (
    <div className="modal-backdrop" onPointerDown={() => setOpen(false)}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <h3>OSC / MIDI mapping</h3>
        <p className="modal__hint">Bridge arrives in M4 — mapping templates save now, bind later.</p>

        <label className="modal__row">
          Profile
          <select value={profile} onChange={(e) => setProfile(e.target.value)}>
            {PROFILES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>

        <div className="mapping__tables">
          {rows.map((row, i) => (
            <div key={i} className="mapping__row">
              <input value={row.action} placeholder="Action" onChange={(e) => update(i, { action: e.target.value })} />
              <input value={row.target} placeholder="OSC address" onChange={(e) => update(i, { target: e.target.value })} />
            </div>
          ))}
        </div>

        <div className="modal__row">
          <button className="btn" onClick={addRow}>+ Row</button>
          <button className="btn" onClick={() => { toast.info('MIDI learn reserved for M4 bridge'); }}>MIDI learn</button>
          <button className="btn modal__close" onClick={() => setOpen(false)}>Done</button>
        </div>
      </div>
    </div>
  );
}