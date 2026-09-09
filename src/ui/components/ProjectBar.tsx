import { useGrid } from '../../store/project';
import { createBrowserFsAdapter } from '../../project/fsAdapter';

const adapter = createBrowserFsAdapter();

export function ProjectBar() {
  const projectName = useGrid((s) => s.projectName);
  const status = useGrid((s) => s.editorStatus);
  const save = useGrid((s) => s.save);
  const saveAs = useGrid((s) => s.saveAs);
  const open = useGrid((s) => s.open);

  const onOpen = async (): Promise<void> => {
    const h = await adapter.pickDirectory();
    if (!h) return;
    const buffer = await h.readText('project.json');
    if (!buffer) { useGrid.getState().select(null); return; }
    await open(h, buffer);
  };

  return (
    <div className="projectbar">
      <span className={`projectbar__dot projectbar__dot--${status}`} title={status} />
      <span className="projectbar__name">{projectName}</span>
      {status === 'dirty' && <span className="projectbar__dirty">●</span>}
      <div className="projectbar__actions">
        <button className="btn btn--sm" onClick={() => void save(adapter)}>Save</button>
        <button className="btn btn--sm" onClick={() => void saveAs(adapter)}>Save as…</button>
        <button className="btn btn--sm" onClick={() => void onOpen()}>Open…</button>
      </div>
    </div>
  );
}
