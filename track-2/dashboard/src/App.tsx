// GPU City — the CFO view. Three questions, in order:
//   1 · Where is the money going   (spend strip + progress)
//   2 · Where to cut               (the deck)
//   3 · What it costs if we're wrong (risk panel + copilot)
import { useApp } from './state';
import { AppProvider } from './state';
import { SpendStrip } from './components/SpendStrip';
import { ProgressArea } from './components/ProgressArea';
import { RiskPanel } from './components/RiskPanel';
import { CardArea } from './components/CardArea';
import { Copilot } from './components/Copilot';
import { GpuCity } from './components/GpuCity';
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
          <span className="brand-mark">◼︎</span>
          <span className="brand-name">GPU City</span>
          <span className="brand-sub">cluster efficiency, for the people who sign off</span>
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

      <div className="main-grid">
        <RiskPanel adjust={adjust} />
        <CardArea />
        <Copilot />
      </div>

      <GpuCity />

      <footer className="footer">
        Numbers describe a four-month job sample, not the whole cluster · savings are ranges, not promises · evidence on every card.
      </footer>

      <EvidenceDrawer />
    </div>
  );
}
