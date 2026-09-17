// Loads ./data into the in-memory model the whole dashboard reads from.
// Read-only: never writes into data/. The official API and pipeline are untouched.
import fs from 'node:fs';
import path from 'node:path';
import { readParquet } from './parquet';
import type { ImpactKind } from '../../shared/types';

export interface Finding {
  id: string;
  detectorId: string;
  shortDescription: string;
  longDescription: string;
  impactDescription: string;
  resourceIds: string[];
  rootCauses: string[];
  status: string;
  severity: string;
  confidence: string;
  category: string;
  priority: string;
  detectionTime: string;
  isActive: boolean;
  metadata: {
    job_id?: number;
    node?: string;
    owner?: string;
    impact_gpu_hours?: number;
    impact_kind?: ImpactKind;
    impact_scope?: string;
    [k: string]: unknown;
  };
}

export interface JobRow {
  id_job: number;
  id_user: number;
  gpu_hours: number;
  sm_util_avg: number;
  is_success: boolean;
  state_name: string;
  primary_node: string | null;
  wait_sec: number;
  id_array_job: number | null;
}

export interface ResourceRow {
  id: string;
  name: string;
  type: string;
}

export interface ResolvedFinding {
  finding: Finding;
  /** dedup key: what physical thing the hours belong to */
  key: string;
  hours: number;
  kind: ImpactKind;
  scope: string;
  user: string | null; // 'u-<n>'
  node: string | null;
  jobId: number | null;
  cap: number | null; // reality ceiling for the key (GPU-hours actually allocated)
}

export interface LoadedModel {
  findings: Finding[];
  findingsByDetector: Map<string, Finding[]>;
  resolved: ResolvedFinding[];
  /** distinct users per detector (for card meta + GPU City highlights) */
  usersByDetector: Map<string, Set<string>>;
  nodesByDetector: Map<string, Set<string>>;
  jobById: Map<number, JobRow>;
  /** caps: dedup key -> real allocated GPU-hours */
  caps: Map<string, number>;
  /** node -> users that ran on it (for node-scope findings) */
  usersByNode: Map<string, Set<string>>;
  /** node -> jobs that ran on it (cross-scope reconciliation) */
  jobsByNode: Map<string, JobRow[]>;
  /** user -> jobs that ran on it */
  jobsByUser: Map<number, JobRow[]>;
  namespaceIdOfUser: Map<string, string>; // 'u-<n>' -> resource id
  resourceNameOf: Map<string, string>; // resource id -> name (root-cause display)
  window: { start: string; end: string };
}

export function resolveDataDir(): string {
  const env = process.env.DATA_DIR;
  if (env) return path.resolve(env);
  return path.resolve(process.cwd(), 'data');
}

const JOB_ID_RE = /^job-(\d+)$/;

export async function loadModel(): Promise<LoadedModel> {
  const dir = resolveDataDir();
  const findingsPath = path.join(dir, 'synthetic', 'findings.json');
  const jobsPath = path.join(dir, 'prepped', 'jobs.parquet');
  const resourcesPath = path.join(dir, 'synthetic', 'resources.parquet');

  const [rawFindings, jobs, resources] = await Promise.all([
    fs.promises.readFile(findingsPath, 'utf8'),
    readParquet<JobRow & { id_array_job: number | null }>(jobsPath),
    readParquet<ResourceRow>(resourcesPath),
  ]);
  const findings = JSON.parse(rawFindings) as Finding[];

  // ---- prepped jobs: id -> row, per-user rolls, per-node rolls
  const jobById = new Map<number, JobRow>();
  const jobsByUser = new Map<number, JobRow[]>();
  const usersByNode = new Map<string, Set<string>>();
  const jobsByNode = new Map<string, JobRow[]>();
  const userCap = new Map<string, number>(); // 'u-<n>' -> total gpu_hours
  const nodeCap = new Map<string, number>(); // node -> total gpu_hours
  const arrayCap = new Map<number, number>(); // id_array_job -> total gpu_hours

  for (const j of jobs) {
    const row: JobRow = {
      id_job: Number(j.id_job),
      id_user: Number(j.id_user),
      gpu_hours: Number(j.gpu_hours),
      sm_util_avg: Number(j.sm_util_avg),
      is_success: Boolean(j.is_success),
      state_name: String(j.state_name ?? ''),
      primary_node: j.primary_node ? String(j.primary_node) : null,
      wait_sec: Number(j.wait_sec),
      id_array_job: j.id_array_job == null || Number.isNaN(Number(j.id_array_job)) ? null : Number(j.id_array_job),
    };
    jobById.set(row.id_job, row);
    const u = `u-${row.id_user}`;
    (jobsByUser.get(row.id_user) ?? jobsByUser.set(row.id_user, []).get(row.id_user)!).push(row);
    userCap.set(u, (userCap.get(u) ?? 0) + row.gpu_hours);
    if (row.primary_node) {
      (usersByNode.get(row.primary_node) ?? usersByNode.set(row.primary_node, new Set()).get(row.primary_node)!).add(u);
      (jobsByNode.get(row.primary_node) ?? jobsByNode.set(row.primary_node, []).get(row.primary_node)!).push(row);
      nodeCap.set(row.primary_node, (nodeCap.get(row.primary_node) ?? 0) + row.gpu_hours);
    }
    if (row.id_array_job != null) {
      arrayCap.set(row.id_array_job, (arrayCap.get(row.id_array_job) ?? 0) + row.gpu_hours);
    }
  }

  // ---- resources: pod name 'job-<id>' -> job id; namespace id per user
  const jobIdOfPod = new Map<string, number>();
  const namespaceIdOfUser = new Map<string, string>();
  for (const r of resources) {
    if (r.type === 'k8s:pod') {
      const m = JOB_ID_RE.exec(r.name);
      if (m) jobIdOfPod.set(r.id, Number(m[1]));
    } else if (r.type === 'k8s:namespace' && r.name.startsWith('ns/u-')) {
      namespaceIdOfUser.set(r.name.slice(3), r.id);
    }
  }

  // ---- resolve every finding: user / node / dedup key / cap
  const findingsByDetector = new Map<string, Finding[]>();
  const usersByDetector = new Map<string, Set<string>>();
  const nodesByDetector = new Map<string, Set<string>>();
  const resolved: ResolvedFinding[] = [];
  const resourceIdToType = new Map(resources.map((r) => [r.id, r.type] as const));
  const resourceIdToName = new Map(resources.map((r) => [r.id, r.name] as const));
  let minT = '', maxT = '';
  for (const f of findings) {
    (findingsByDetector.get(f.detectorId) ?? findingsByDetector.set(f.detectorId, []).get(f.detectorId)!).push(f);
    const md = f.metadata ?? {};
    const hours = typeof md.impact_gpu_hours === 'number' && md.impact_gpu_hours > 0 ? md.impact_gpu_hours : 0;
    const kind: ImpactKind = (md.impact_kind as ImpactKind) ?? 'none';
    const scope = (md.impact_scope as string) ?? '';
    if (f.detectionTime && (!minT || f.detectionTime < minT)) minT = f.detectionTime;
    if (f.detectionTime && (!maxT || f.detectionTime > maxT)) maxT = f.detectionTime;

    // user resolution cascade: owner -> job_id -> pod resource -> node's users
    let user: string | null = null;
    let jobId: number | null = null;
    let arrayId: string | null = null;
    if (md.owner) user = String(md.owner);
    if (md.job_id != null) jobId = Number(md.job_id);
    if (!user && jobId != null) {
      const row = jobById.get(jobId);
      if (row) user = `u-${row.id_user}`;
    }
    if (!jobId) {
      for (const rid of f.resourceIds) {
        if (resourceIdToType.get(rid) === 'k8s:job') { arrayId = rid; continue; }
        if (resourceIdToType.get(rid) === 'k8s:pod') {
          const jid = jobIdOfPod.get(rid);
          if (jid != null) { jobId = jid; if (!user) { const row = jobById.get(jid); if (row) user = `u-${row.id_user}`; } }
        }
      }
    }

    // node resolution: metadata.node -> node-typed resource -> job's machine
    let node: string | null = null;
    if (md.node) node = String(md.node);
    if (!node && jobId != null) node = jobById.get(jobId)?.primary_node ?? null;
    if (!node) {
      for (const rid of f.resourceIds) {
        if (resourceIdToType.get(rid) === 'k8s:node') { node = resourceIdToName.get(rid) ?? null; break; }
      }
    }
    if (!user && node) {
      const us = usersByNode.get(node);
      // node-scope finding: the building highlight covers every team on the
      // node; a single "primary" user is kept only for evidence rows
      if (us && us.size) user = [...us][0];
    }

    // dedup key + reality cap
    let key: string;
    let cap: number | null = null;
    if (scope === 'job') {
      if (jobId != null) { key = `job:${jobId}`; cap = jobById.get(jobId)?.gpu_hours ?? null; }
      else if (arrayId) { key = `array:${arrayId}`; cap = arrayCap.get(Number(resourceIdToName.get(arrayId)?.replace('array/', '') || NaN)) ?? null; }
      else key = `finding:${f.id}`;
    } else if (scope === 'node' && node) {
      key = `node:${node}`;
      cap = nodeCap.get(node) ?? null;
    } else if (scope === 'user' && user) {
      key = `user:${user}`;
      cap = userCap.get(user) ?? null;
    } else if (scope === 'cluster') {
      key = `cluster:${f.detectorId}`;
    } else {
      key = `finding:${f.id}`;
    }

    resolved.push({ finding: f, key, hours, kind, scope, user, node, jobId, cap });
    const detUsers = (usersByDetector.get(f.detectorId) ?? usersByDetector.set(f.detectorId, new Set()).get(f.detectorId)!)!;
    if (scope === 'node' && node) {
      // the whole node is affected: highlight every team that ran on it
      for (const u of usersByNode.get(node) ?? []) detUsers.add(u);
    } else if (user) {
      detUsers.add(user);
    }
    if (node) {
      (nodesByDetector.get(f.detectorId) ?? nodesByDetector.set(f.detectorId, new Set()).get(f.detectorId)!)!.add(node);
    }
  }

  const caps = new Map<string, number>();
  for (const r of resolved) if (r.cap != null && !caps.has(r.key)) caps.set(r.key, r.cap);

  return {
    findings,
    findingsByDetector,
    resolved,
    usersByDetector,
    nodesByDetector,
    jobById,
    caps,
    usersByNode,
    jobsByNode,
    jobsByUser,
    namespaceIdOfUser,
    resourceNameOf: resourceIdToName,
    window: { start: minT.slice(0, 10), end: maxT.slice(0, 10) },
  };
}
