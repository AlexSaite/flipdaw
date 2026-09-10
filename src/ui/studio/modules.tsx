import { Grid } from '../components/Grid';
import { Inspector } from '../components/Inspector';
import { StepSequencer } from '../components/StepSequencer';
import { Piano } from '../components/Piano';
import { Sampler } from '../components/Sampler';
import { DJDeck } from '../components/DJDeck';
import { Turntable } from '../components/Turntable';
import type { DeckKey } from '../../store/ui';

/** Renders one module. Shared by the stage tiles and the scaled wall minis. */
export function DeckModule({ d }: { d: DeckKey }) {
  switch (d) {
    case 'grid':
      return (
        <div className="studio__gridwrap">
          <div className="studio__gridleft">
            <Grid />
          </div>
          <Inspector />
        </div>
      );
    case 'drum': return <StepSequencer />;
    case 'piano': return <Piano />;
    case 'sampler': return <Sampler />;
    case 'dj': return <DJDeck />;
    case 'tt': return <Turntable />;
  }
}