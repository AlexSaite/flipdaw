interface NameplateProps {
  /** Hardware model, e.g. "TR-909". */
  model: string;
  /** Function, e.g. "DRUM SEQUENCER". */
  name: string;
}

/** Hardware silkscreen label for a deck skin (UI-REDESIGN §6). */
export function Nameplate({ model, name }: NameplateProps) {
  return (
    <span className="nameplate">
      <span className="nameplate__model">{model}</span>
      <span className="nameplate__name">{name}</span>
    </span>
  );
}