// 3D city skyline (huiyuan-city), now genuinely connected to the hand: the
// same `selected` + `deck` + `adjust` + `teams` state CardArea/PlayerHand/
// RiskPanel already read from useApp() drives which buildings the skyline
// shows as affected, via a real live-data transform (see
// components/skyline/buildLiveBuildings.ts) -- not a second source of
// truth, not a random animation.
//
// The renderer itself (track-2/skyline/index.html, served same-origin at
// /city/skyline/) is UNCHANGED in its drawing engine (camera, buildings,
// sky/bay art direction, colors) -- only a small additive postMessage
// bridge was appended to it. It never sees `adjust` or the Decision
// Engine directly; it only draws whatever building list this component
// posts to it. This is deliberate: the skyline receives RESULTS, it does
// not decide anything.
//
// This is now the ONLY visible GPU City visualization -- no toggle, no
// "show 3D view" gate, since it's no longer a secondary extra.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { buildLiveBuildings } from './skyline/buildLiveBuildings';
import { useApp } from '../state';

export function CitySkyline3D() {
  const { deck, teams, maxTeamHours, adjust, selected } = useApp();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);

  // Per-card affectedUserIds, fetched from the SAME /api/selection/adjust
  // endpoint CardArea's selection already uses -- one call per selected
  // card, only for cards not already cached. Used only to label which
  // card(s) touch a hovered building; the combined affected/not-affected
  // fact always comes from the full-hand `adjust` above, never from this.
  const cardAffectedCache = useRef(new Map<string, { title: string; ids: Set<string> }>());
  const [, forceRerender] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const missing = selected.filter((id) => !cardAffectedCache.current.has(id));
    if (missing.length === 0) return;
    Promise.all(
      missing.map(async (id) => {
        try {
          const resp = await api.adjust([id]);
          const title = deck?.find((c) => c.id === id)?.title ?? id;
          return [id, { title, ids: new Set(resp.affectedUserIds) }] as const;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      for (const r of results) if (r) cardAffectedCache.current.set(r[0], r[1]);
      forceRerender((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [selected, deck]);

  // Listen for the iframe's readiness signal before posting anything --
  // avoids a race where we post before its message listener is attached.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'GPU_CITY_READY') setReady(true);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const perCardMap = useMemo(() => {
    const m = new Map<string, { title: string; ids: Set<string> }>();
    for (const id of selected) {
      const hit = cardAffectedCache.current.get(id);
      if (hit) m.set(id, hit);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, cardAffectedCache.current.size]);

  const payload = useMemo(() => {
    if (!teams) return null;
    return buildLiveBuildings(teams, maxTeamHours, adjust, perCardMap);
  }, [teams, maxTeamHours, adjust, perCardMap]);

  useEffect(() => {
    if (!ready || !payload || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({ type: 'GPU_CITY_UPDATE', ...payload }, '*');
  }, [ready, payload]);

  const n = selected.length;
  const mode = payload?.meta.mode ?? 'baseline';

  return (
    <section className="panel city-panel skyline-panel" aria-label="3D city skyline">
      <div className="city-head">
        <div className="section-label">3 · The city — projected impact of your hand</div>
        <div className={`city-mode-badge city-mode-${mode}`}>
          {mode === 'projected' ? `Projected impact — ${n} card${n === 1 ? '' : 's'} selected` : 'Baseline'}
        </div>
      </div>

      {adjust && n > 0 && (
        <div className="city-summary">
          <span>
            <b>{n}</b> card{n === 1 ? '' : 's'} selected
          </span>
          <span>
            <b>{adjust.affectedUsers}</b> teams affected
          </span>
          <span>
            Projected savings <b>{fmtUsdRange(adjust.adjustedUsd)}</b>
          </span>
          {adjust.coverageLow != null && adjust.coverageHigh != null && (
            <span>
              Target coverage <b>{Math.round(adjust.coverageLow * 100)}–{Math.round(adjust.coverageHigh * 100)}%</b>
            </span>
          )}
          <span className={`city-risk-tag risk-${adjust.risk.level.toLowerCase()}`}>Risk: {adjust.risk.level}</span>
        </div>
      )}

      <div className="skyline-frame-wrap">
        <iframe ref={iframeRef} src="/city/skyline/" title="GPU energy city skyline" className="skyline-frame" />
      </div>

      <p className="skyline-hint">
        {mode === 'projected'
          ? 'Affected buildings show a qualitative projected improvement toward greater efficiency — not a computed forecast of exact future utilization. Buildings already efficient don’t change; nothing here claims the cluster has actually been modified.'
          : 'Baseline: building height = current GPU usage per team, color = current efficiency state. Select a card to see its projected impact.'}
      </p>
    </section>
  );
}

function fmtUsdRange(r: { low: number; high: number }): string {
  const f = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
  return `${f(r.low)}–${f(r.high)}`;
}
