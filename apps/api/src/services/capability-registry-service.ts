/**
 * AskABD Platform Capability Registry Service
 * Self-documenting registry of all platform capabilities with maturity tracking,
 * roadmap management, dependency graph, and gap identification.
 * Uses shared DB pool. Domain-agnostic. Idempotent operations.
 */
import { sharedPool } from './db-pool.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Capability {
  id: string;
  name: string;
  description?: string;
  category: string;
  domain: string;
  businessProblem?: string;
  businessValue?: string;
  maturity: number;
  status: string;
  dependencies: string[];
  relatedServices: string[];
  relatedApis: string[];
  knownGaps: string[];
  evidence: string[];
  limitations: string[];
  roadmapPhase: string;
  priority: string;
  owner?: string;
  externalDependencies: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CapabilitySummary {
  total: number;
  operational: number;
  available: number;
  beta: number;
  foundation: number;
  planned: number;
  avgMaturity: number;
  byCategory: Record<string, number>;
  byDomain: Record<string, number>;
  byRoadmapPhase: Record<string, number>;
  criticalGaps: string[];
}

export interface RoadmapView {
  current: Capability[];
  next: Capability[];
  future: Capability[];
}

const MATURITY_LABELS: Record<number, string> = {
  0: 'Planned',
  1: 'Foundation',
  2: 'Basic',
  3: 'Functional',
  4: 'Mature',
  5: 'Optimized',
};

// ─── Service ──────────────────────────────────────────────────────────────────

export class CapabilityRegistryService {

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  async getAll(filters?: { category?: string; domain?: string; status?: string; roadmapPhase?: string }): Promise<Capability[]> {
    let where = 'WHERE 1=1';
    const params: any[] = [];
    let idx = 1;

    if (filters?.category) { where += ` AND category = $${idx++}`; params.push(filters.category); }
    if (filters?.domain) { where += ` AND domain = $${idx++}`; params.push(filters.domain); }
    if (filters?.status) { where += ` AND status = $${idx++}`; params.push(filters.status); }
    if (filters?.roadmapPhase) { where += ` AND roadmap_phase = $${idx++}`; params.push(filters.roadmapPhase); }

    const { rows } = await sharedPool.query(
      `SELECT * FROM oc_capabilities ${where} ORDER BY category, maturity DESC, name`,
      params
    );
    return rows.map(this.mapCapability);
  }

  async getById(id: string): Promise<Capability | null> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_capabilities WHERE id = $1', [id]);
    return rows.length > 0 ? this.mapCapability(rows[0]) : null;
  }

  async create(data: Partial<Capability>): Promise<Capability> {
    const id = data.id || `cap-${Date.now().toString(36)}`;
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_capabilities (id, name, description, category, domain, business_problem, business_value, maturity, status, dependencies, related_services, related_apis, known_gaps, evidence, limitations, roadmap_phase, priority, owner, external_dependencies)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,
        domain = EXCLUDED.domain, business_problem = EXCLUDED.business_problem,
        business_value = EXCLUDED.business_value, maturity = EXCLUDED.maturity,
        status = EXCLUDED.status, dependencies = EXCLUDED.dependencies,
        related_services = EXCLUDED.related_services, related_apis = EXCLUDED.related_apis,
        known_gaps = EXCLUDED.known_gaps, evidence = EXCLUDED.evidence,
        limitations = EXCLUDED.limitations, roadmap_phase = EXCLUDED.roadmap_phase,
        priority = EXCLUDED.priority, owner = EXCLUDED.owner,
        external_dependencies = EXCLUDED.external_dependencies, updated_at = NOW()
      RETURNING *
    `, [
      id, data.name || 'Unnamed', data.description || null,
      data.category || 'platform', data.domain || 'platform',
      data.businessProblem || null, data.businessValue || null,
      data.maturity ?? 0, data.status || 'planned',
      JSON.stringify(data.dependencies || []), JSON.stringify(data.relatedServices || []),
      JSON.stringify(data.relatedApis || []), JSON.stringify(data.knownGaps || []),
      JSON.stringify(data.evidence || []), JSON.stringify(data.limitations || []),
      data.roadmapPhase || 'future', data.priority || 'medium',
      data.owner || null, JSON.stringify(data.externalDependencies || []),
    ]);
    return this.mapCapability(rows[0]);
  }

  async update(id: string, data: Partial<Capability>): Promise<Capability | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const { rows } = await sharedPool.query(`
      UPDATE oc_capabilities SET
        name = COALESCE($2, name), description = COALESCE($3, description),
        category = COALESCE($4, category), domain = COALESCE($5, domain),
        business_problem = COALESCE($6, business_problem), business_value = COALESCE($7, business_value),
        maturity = COALESCE($8, maturity), status = COALESCE($9, status),
        roadmap_phase = COALESCE($10, roadmap_phase), priority = COALESCE($11, priority),
        owner = COALESCE($12, owner), updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id, data.name, data.description, data.category, data.domain,
      data.businessProblem, data.businessValue, data.maturity, data.status,
      data.roadmapPhase, data.priority, data.owner]);

    return rows.length > 0 ? this.mapCapability(rows[0]) : null;
  }

  // ─── Summary & Analytics ────────────────────────────────────────────────────

  async getSummary(): Promise<CapabilitySummary> {
    const { rows } = await sharedPool.query(`
      SELECT
        count(*) as total,
        count(*) FILTER (WHERE status = 'operational') as operational,
        count(*) FILTER (WHERE status = 'available') as available,
        count(*) FILTER (WHERE status = 'beta') as beta,
        count(*) FILTER (WHERE status = 'foundation') as foundation,
        count(*) FILTER (WHERE status = 'planned') as planned,
        COALESCE(AVG(maturity), 0) as avg_maturity
      FROM oc_capabilities
    `);

    const catRows = await sharedPool.query(`SELECT category, count(*) as cnt FROM oc_capabilities GROUP BY category ORDER BY cnt DESC`);
    const domainRows = await sharedPool.query(`SELECT domain, count(*) as cnt FROM oc_capabilities GROUP BY domain ORDER BY cnt DESC`);
    const phaseRows = await sharedPool.query(`SELECT roadmap_phase, count(*) as cnt FROM oc_capabilities GROUP BY roadmap_phase ORDER BY cnt DESC`);
    const gapRows = await sharedPool.query(`SELECT id, name, known_gaps FROM oc_capabilities WHERE jsonb_array_length(known_gaps) > 0 AND status = 'operational'`);

    const s = rows[0] || {};
    const byCategory: Record<string, number> = {};
    catRows.rows.forEach((r: any) => { byCategory[r.category] = parseInt(r.cnt); });
    const byDomain: Record<string, number> = {};
    domainRows.rows.forEach((r: any) => { byDomain[r.domain] = parseInt(r.cnt); });
    const byRoadmapPhase: Record<string, number> = {};
    phaseRows.rows.forEach((r: any) => { byRoadmapPhase[r.roadmap_phase] = parseInt(r.cnt); });

    const criticalGaps: string[] = [];
    gapRows.rows.forEach((r: any) => {
      const gaps = r.known_gaps || [];
      if (gaps.length > 0) criticalGaps.push(`${r.name}: ${gaps.join('; ')}`);
    });

    return {
      total: parseInt(s.total || '0'),
      operational: parseInt(s.operational || '0'),
      available: parseInt(s.available || '0'),
      beta: parseInt(s.beta || '0'),
      foundation: parseInt(s.foundation || '0'),
      planned: parseInt(s.planned || '0'),
      avgMaturity: parseFloat(parseFloat(s.avg_maturity || '0').toFixed(1)),
      byCategory,
      byDomain,
      byRoadmapPhase,
      criticalGaps,
    };
  }

  // ─── Roadmap ────────────────────────────────────────────────────────────────

  async getRoadmap(): Promise<RoadmapView> {
    const all = await this.getAll();
    return {
      current: all.filter(c => c.roadmapPhase === 'current'),
      next: all.filter(c => c.roadmapPhase === 'next'),
      future: all.filter(c => c.roadmapPhase === 'future'),
    };
  }

  // ─── Dependency Graph ───────────────────────────────────────────────────────

  async getDependencyGraph(): Promise<{ nodes: any[]; edges: any[] }> {
    const all = await this.getAll();
    const nodes = all.map(c => ({
      id: c.id, name: c.name, category: c.category, status: c.status, maturity: c.maturity,
    }));
    const edges: any[] = [];
    for (const cap of all) {
      for (const dep of cap.dependencies) {
        edges.push({ from: dep, to: cap.id, type: 'depends_on' });
      }
    }
    return { nodes, edges };
  }

  // ─── Maturity Assessment ────────────────────────────────────────────────────

  async getMaturityReport(): Promise<{ capabilities: any[]; overallMaturity: number; maturityDistribution: Record<string, number> }> {
    const all = await this.getAll();
    const capabilities = all.map(c => ({
      id: c.id, name: c.name, category: c.category, maturity: c.maturity,
      maturityLabel: MATURITY_LABELS[c.maturity] || 'Unknown',
      status: c.status, knownGaps: c.knownGaps.length, limitations: c.limitations.length,
    }));

    const operational = all.filter(c => c.status !== 'planned');
    const overallMaturity = operational.length > 0
      ? parseFloat((operational.reduce((sum, c) => sum + c.maturity, 0) / operational.length).toFixed(1))
      : 0;

    const maturityDistribution: Record<string, number> = {};
    for (const label of Object.values(MATURITY_LABELS)) maturityDistribution[label] = 0;
    all.forEach(c => {
      const label = MATURITY_LABELS[c.maturity] || 'Unknown';
      maturityDistribution[label] = (maturityDistribution[label] || 0) + 1;
    });

    return { capabilities, overallMaturity, maturityDistribution };
  }

  // ─── Mapper ─────────────────────────────────────────────────────────────────

  private mapCapability(row: any): Capability {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      domain: row.domain,
      businessProblem: row.business_problem,
      businessValue: row.business_value,
      maturity: row.maturity ?? 0,
      status: row.status,
      dependencies: row.dependencies || [],
      relatedServices: row.related_services || [],
      relatedApis: row.related_apis || [],
      knownGaps: row.known_gaps || [],
      evidence: row.evidence || [],
      limitations: row.limitations || [],
      roadmapPhase: row.roadmap_phase || 'future',
      priority: row.priority || 'medium',
      owner: row.owner,
      externalDependencies: row.external_dependencies || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
