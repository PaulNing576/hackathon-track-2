// GPU City — the decision table. You are the CFO: play the hand that cuts
// 20% of GPU spend without an unacceptable bet on operational risk.
//   TOP    · the pot (20% target)
//   CENTER · the table (available opportunity cards)
//   ROW    · what you're betting (risk) · your hand · the dealer (advisory)
//   BELOW  · the 3D city skyline
import { useApp } from './state';
import { AppProvider } from './state';
import { SpendStrip } from './components/SpendStrip';
import { ProgressArea } from './components/ProgressArea';
import { RiskPanel } from './components/RiskPanel';
import { CardArea } from './components/CardArea';
import { PlayerHand } from './components/PlayerHand';
import { Copilot } from './components/Copilot';
import { CitySkyline3D } from './components/CitySkyline3D';
import { EvidenceDrawer } from './components/EvidenceDrawer';
import { fmtInt } from '../shared/format';

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { deck, meta, context, teams, selected, adjust, adjustPending } = useApp();

  if (!deck || !context || !teams || !meta) {
    return (
      <div className="loading-screen">
        <h1>GPU City</h1>
        <p>Reading the estate…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-mark">♠</span>
          <span className="brand-name">GPU City</span>
          <span className="brand-sub">the decision table — cut 20%, hold your nerve</span>
        </div>
        <div className="header-meta">
          <span>
            {meta.window.start} → {meta.window.end}
          </span>
          <span>{fmtInt(meta.totalFindings)} findings</span>
          <span>{deck.length} opportunities</span>
          <span>{teams.length} teams</span>
        </div>
      </header>

      <div className="q-label">1 · Where is the money going?</div>
      <SpendStrip context={context} jobCount={context.jobs} />
      <ProgressArea adjust={adjust} context={context} selectedCount={selected.length} pending={adjustPending} />

      <div className="q-label">2 · The table — choose your hand</div>
      <CardArea />

      <div className="table-zone">
        <RiskPanel adjust={adjust} />
        <PlayerHand />
        <Copilot />
      </div>

      {/* The old 2D "THE ESTATE — GPU CITY" panel (GpuCity.tsx) is
          intentionally not rendered here per the current design direction —
          the 3D skyline below is now the only visible city visualization.
          GpuCity.tsx, its /api/city/teams backend, and the `teams` state
          used in the header above are left fully intact, unused only from
          this page. */}
      <CitySkyline3D />

      <footer className="footer">
        Numbers describe a four-month job sample, not the whole cluster · savings are ranges, not promises · evidence on every card.
      </footer>

      <EvidenceDrawer />
    </div>
  );
}
