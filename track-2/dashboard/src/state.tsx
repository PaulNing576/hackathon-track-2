// Global app state: deck, context, teams, selection, adjustment, evidence drawer.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ContextData, Opportunity, SelectionAdjustment, TeamBuilding } from '../shared/types';
import { api } from './api';

interface AppState {
  deck: Opportunity[] | null;
  meta: { totalFindings: number; window: { start: string; end: string } } | null;
  context: ContextData | null;
  teams: TeamBuilding[] | null;
  maxTeamHours: number;
  selected: string[];
  adjust: SelectionAdjustment | null;
  adjustPending: boolean;
  flipped: Set<string>;
  evidenceCard: string | null;
  toggleSelect: (cardId: string) => void;
  flip: (cardId: string) => void;
  openEvidence: (cardId: string) => void;
  closeEvidence: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [deck, setDeck] = useState<Opportunity[] | null>(null);
  const [meta, setMeta] = useState<AppState['meta']>(null);
  const [context, setContext] = useState<ContextData | null>(null);
  const [teams, setTeams] = useState<TeamBuilding[] | null>(null);
  const [maxTeamHours, setMaxTeamHours] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [adjust, setAdjust] = useState<SelectionAdjustment | null>(null);
  const [adjustPending, setAdjustPending] = useState(false);
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [evidenceCard, setEvidenceCard] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [d, c, t] = await Promise.all([api.deck(), api.context(), api.teams()]);
        setDeck(d.cards);
        setMeta({ totalFindings: d.meta.totalFindings, window: d.meta.window });
        setContext(c);
        setTeams(t.teams);
        setMaxTeamHours(t.max.gpuHours);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!deck) return;
    setAdjustPending(true);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        setAdjust(await api.adjust(selected));
      } catch (e) {
        setError(String(e));
      } finally {
        setAdjustPending(false);
      }
    }, 140);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [selected, deck]);

  const toggleSelect = useCallback((cardId: string) => {
    setSelected((s) => (s.includes(cardId) ? s.filter((x) => x !== cardId) : [...s, cardId]));
  }, []);

  const flip = useCallback((cardId: string) => {
    setFlipped((f) => {
      const n = new Set(f);
      if (n.has(cardId)) n.delete(cardId);
      else n.add(cardId);
      return n;
    });
  }, []);

  const openEvidence = useCallback((cardId: string) => setEvidenceCard(cardId), []);
  const closeEvidence = useCallback(() => setEvidenceCard(null), []);

  if (error) {
    return (
      <div className="fatal">
        <h1>GPU City couldn't load</h1>
        <p>{error}</p>
        <p>Is the dashboard server running with ./data available?</p>
      </div>
    );
  }

  return (
    <Ctx.Provider
      value={{
        deck,
        meta,
        context,
        teams,
        maxTeamHours,
        selected,
        adjust,
        adjustPending,
        flipped,
        evidenceCard,
        toggleSelect,
        flip,
        openEvidence,
        closeEvidence,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const s = useContext(Ctx);
  if (!s) throw new Error('useApp outside AppProvider');
  return s;
}
