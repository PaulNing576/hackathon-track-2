// GPU City buildings: one per team (k8s namespace in the resource graph).
// Height = GPU usage; color = efficiency state. Computed from the prepped
// jobs table + resolved findings — nothing hardcoded.
import type { TeamBuilding } from '../../shared/types';
import type { LoadedModel } from '../load/data';

export function buildTeams(model: LoadedModel, usdPerGpuHour: number): TeamBuilding[] {
  const roll = new Map<
    string,
    { jobs: number; gpuHours: number; successHours: number; failHours: number; utilWeighted: number; findings: number; activeFindings: number }
  >();

  for (const [, rows] of model.jobsByUser) {
    const u = `u-${rows[0].id_user}`;
    let gpuHours = 0;
    let successHours = 0;
    let failHours = 0; // TIMEOUT/FAILED/NODE_FAIL/unknown — NOT cancelled (deliberate)
    let utilWeighted = 0;
    for (const j of rows) {
      gpuHours += j.gpu_hours;
      utilWeighted += j.gpu_hours * (j.sm_util_avg / 100);
      if (j.is_success) successHours += j.gpu_hours;
      else if (j.state_name !== 'CANCELLED') failHours += j.gpu_hours;
    }
    roll.set(u, {
      jobs: rows.length,
      gpuHours,
      successHours,
      failHours,
      utilWeighted,
      findings: 0,
      activeFindings: 0,
    });
  }

  for (const r of model.resolved) {
    const targets = new Set<string>();
    if (r.scope === 'node' && r.node) {
      for (const u of model.usersByNode.get(r.node) ?? []) targets.add(u);
    } else if (r.user) {
      targets.add(r.user);
    }
    for (const u of targets) {
      const t = roll.get(u);
      if (!t) continue;
      t.findings++;
      if (r.finding.isActive) t.activeFindings++;
    }
  }

  const teams: TeamBuilding[] = [...roll.entries()].map(([id, t]) => {
    const successShare = t.gpuHours > 0 ? t.successHours / t.gpuHours : 1;
    // failure rate excludes CANCELLED: deliberate early stopping is not failure
    const failShare = t.failHours + t.successHours > 0 ? t.failHours / (t.failHours + t.successHours) : 0;
    const utilization = t.gpuHours > 0 ? (t.utilWeighted / t.gpuHours) * 100 : 0;
    let state: TeamBuilding['state'];
    if (t.failHours >= 50 && failShare >= 0.5) state = 'failing';
    else if (utilization < 25) state = 'underused';
    else if (utilization >= 50 && failShare < 0.2) state = 'healthy';
    else state = 'mixed';
    return {
      id,
      jobs: t.jobs,
      gpuHours: Math.round(t.gpuHours),
      usd: Math.round(t.gpuHours * usdPerGpuHour),
      successShare,
      utilization,
      findings: t.findings,
      activeFindings: t.activeFindings,
      state,
    };
  });

  teams.sort((a, b) => b.gpuHours - a.gpuHours);
  return teams;
}
