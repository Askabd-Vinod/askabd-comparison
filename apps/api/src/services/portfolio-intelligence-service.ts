/**
 * AskABD Portfolio Intelligence Service
 * Aggregates data across ALL clients for enterprise-level decision making.
 * Reuses: All existing tables (problems, gaps, transformations, financial, optimization, etc.)
 * NO new tables — pure aggregation and intelligence on existing data.
 * Client-isolated for drill-down. Admin-level for portfolio view.
 */
import { sharedPool } from './db-pool.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PortfolioHealth {
  timestamp: string;
  clients: { total: number; active: number; onboarding: number; transformation: number; managed: number; atRisk: number };
  problems: { total: number; critical: number; high: number; open: number; resolved: number };
  gaps: { total: number; critical: number; open: number; resolved: number; avgMaturityGap: number };
  transformations: { total: number; planned: number; inProgress: number; completed: number; delayed: number; failed: number };
  optimization: { findings: number; unresolved: number; metricsActive: number };
  financial: { totalInvestment: number; expectedSavings: number; actualSavings: number; missedSavings: number; avgRoi: number; avgBenefitRealization: number };
  overallHealth: string;
  overallScore: number;
}

export interface ClientHealthScore {
  clientId: string; clientName: string; status: string;
  score: number; health: string; riskLevel: string;
  factors: { name: string; score: number; weight: number; evidence: string }[];
  topRisks: string[];
  lifecycleStatus?: string;
}

export interface CrossClientPattern {
  type: string; key: string; label: string;
  frequency: number; affectedClients: string[];
  financialImpact: number; avgEffort: number;
  severity: string; recommendation: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class PortfolioIntelligenceService {

  // ═══════════════════════════════════════════════════════════════════════════
  // PORTFOLIO HEALTH
  // ═══════════════════════════════════════════════════════════════════════════

  async getPortfolioHealth(): Promise<PortfolioHealth> {
    const [clientsRes, problemsRes, gapsRes, tfmRes, optRes, finRes, outcomeRes] = await Promise.all([
      sharedPool.query(`SELECT count(*) as total, count(*) FILTER (WHERE status = 'active') as active FROM oc_clients`),
      sharedPool.query(`SELECT count(*) as total, count(*) FILTER (WHERE severity = 'critical') as critical, count(*) FILTER (WHERE severity = 'high') as high, count(*) FILTER (WHERE status NOT IN ('resolved','rejected')) as open, count(*) FILTER (WHERE status = 'resolved') as resolved FROM oc_problems`),
      sharedPool.query(`SELECT count(*) as total, count(*) FILTER (WHERE severity = 'critical') as critical, count(*) FILTER (WHERE status NOT IN ('resolved','closed','rejected','accepted_risk')) as open, count(*) FILTER (WHERE status IN ('resolved','closed')) as resolved, COALESCE(AVG(target_maturity - current_maturity), 0) as avg_gap FROM oc_gaps`),
      sharedPool.query(`SELECT count(*) as total, count(*) FILTER (WHERE status = 'planned') as planned, count(*) FILTER (WHERE status = 'in_progress') as in_progress, count(*) FILTER (WHERE status = 'completed') as completed, count(*) FILTER (WHERE status = 'failed') as failed FROM oc_transformations`),
      sharedPool.query(`SELECT count(*) as findings, count(*) FILTER (WHERE status IN ('detected','acknowledged')) as unresolved FROM oc_optimization_findings`),
      sharedPool.query(`SELECT COALESCE(SUM(implementation_cost), 0) as investment, COALESCE(SUM(annual_savings), 0) as expected_savings, COALESCE(AVG(roi_percentage), 0) as avg_roi FROM oc_financial_estimates`),
      sharedPool.query(`SELECT COALESCE(SUM(actual_savings), 0) as actual_savings, COALESCE(SUM(expected_savings), 0) as expected_savings_out, COALESCE(AVG(benefit_realization_pct), 0) as avg_benefit FROM oc_transformation_outcomes`),
    ]);

    // Lifecycle-based client classification
    const lcRes = await sharedPool.query(`SELECT status, count(*) as cnt FROM oc_lifecycle GROUP BY status`);
    const lcMap: Record<string, number> = {};
    lcRes.rows.forEach((r: any) => { lcMap[r.status] = parseInt(r.cnt); });

    const onboarding = (lcMap['organization-created'] || 0) + (lcMap['identity-verified'] || 0) + (lcMap['otp-verified'] || 0);
    const transformation = (lcMap['discovery-complete'] || 0) + (lcMap['assessment-complete'] || 0) + (lcMap['recommendations-ready'] || 0) + (lcMap['migration-planned'] || 0) + (lcMap['migration-approved'] || 0) + (lcMap['migration-running'] || 0);
    const managed = (lcMap['managed-services'] || 0) + (lcMap['engineering-intelligence'] || 0);

    const metricsRes = await sharedPool.query(`SELECT count(*) FILTER (WHERE enabled) as active FROM oc_metric_definitions`);

    const c = clientsRes.rows[0]; const p = problemsRes.rows[0]; const g = gapsRes.rows[0];
    const t = tfmRes.rows[0]; const o = optRes.rows[0]; const f = finRes.rows[0]; const out = outcomeRes.rows[0];

    const expectedSavings = parseFloat(f.expected_savings || '0');
    const actualSavings = parseFloat(out.actual_savings || '0');
    const missedSavings = Math.max(0, parseFloat(out.expected_savings_out || '0') - actualSavings);

    // Calculate overall score (0-100)
    const criticalProblems = parseInt(p.critical || '0');
    const unresolvedFindings = parseInt(o.unresolved || '0');
    const failedTfm = parseInt(t.failed || '0');
    let score = 100;
    score -= criticalProblems * 10;
    score -= unresolvedFindings * 5;
    score -= failedTfm * 15;
    score = Math.max(0, Math.min(100, score));

    const overallHealth = score >= 80 ? 'healthy' : score >= 60 ? 'watch' : score >= 40 ? 'at_risk' : 'critical';

    return {
      timestamp: new Date().toISOString(),
      clients: { total: parseInt(c.total), active: parseInt(c.active || '0'), onboarding, transformation, managed, atRisk: criticalProblems > 0 ? 1 : 0 },
      problems: { total: parseInt(p.total), critical: criticalProblems, high: parseInt(p.high || '0'), open: parseInt(p.open || '0'), resolved: parseInt(p.resolved || '0') },
      gaps: { total: parseInt(g.total), critical: parseInt(g.critical || '0'), open: parseInt(g.open || '0'), resolved: parseInt(g.resolved || '0'), avgMaturityGap: parseFloat(parseFloat(g.avg_gap || '0').toFixed(1)) },
      transformations: { total: parseInt(t.total), planned: parseInt(t.planned || '0'), inProgress: parseInt(t.in_progress || '0'), completed: parseInt(t.completed || '0'), delayed: 0, failed: parseInt(t.failed || '0') },
      optimization: { findings: parseInt(o.findings || '0'), unresolved: unresolvedFindings, metricsActive: parseInt(metricsRes.rows[0]?.active || '0') },
      financial: { totalInvestment: parseFloat(f.investment || '0'), expectedSavings, actualSavings, missedSavings, avgRoi: parseFloat(parseFloat(f.avg_roi || '0').toFixed(1)), avgBenefitRealization: parseFloat(parseFloat(out.avg_benefit || '0').toFixed(1)) },
      overallHealth, overallScore: score,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT HEALTH SCORES
  // ═══════════════════════════════════════════════════════════════════════════

  async getClientHealthScores(): Promise<ClientHealthScore[]> {
    const clients = await sharedPool.query(`SELECT id, name, status FROM oc_clients ORDER BY name`);
    const scores: ClientHealthScore[] = [];

    for (const client of clients.rows) {
      const score = await this.calculateClientHealth(client.id, client.name, client.status);
      scores.push(score);
    }
    return scores.sort((a, b) => a.score - b.score); // Worst first
  }

  async calculateClientHealth(clientId: string, clientName: string, clientStatus: string): Promise<ClientHealthScore> {
    const [probRes, gapRes, tfmRes, optRes, lcRes] = await Promise.all([
      sharedPool.query(`SELECT count(*) FILTER (WHERE severity = 'critical') as critical, count(*) FILTER (WHERE severity = 'high') as high, count(*) FILTER (WHERE status NOT IN ('resolved','rejected')) as open FROM oc_problems WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT count(*) FILTER (WHERE severity IN ('critical','high')) as critical_high, count(*) FILTER (WHERE status NOT IN ('resolved','closed','rejected','accepted_risk')) as open FROM oc_gaps WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT count(*) FILTER (WHERE status = 'failed') as failed, count(*) FILTER (WHERE status = 'in_progress') as active FROM oc_transformations WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT count(*) FILTER (WHERE status IN ('detected','acknowledged')) as unresolved FROM oc_optimization_findings WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT status FROM oc_lifecycle WHERE client_id = $1 ORDER BY updated_at DESC LIMIT 1`, [clientId]),
    ]);

    const p = probRes.rows[0] || {}; const g = gapRes.rows[0] || {};
    const t = tfmRes.rows[0] || {}; const o = optRes.rows[0] || {};
    const lifecycleStatus = lcRes.rows[0]?.status || 'unknown';

    const factors: { name: string; score: number; weight: number; evidence: string }[] = [];

    // Factor 1: Critical problems (weight 30)
    const critProb = parseInt(p.critical || '0');
    const probScore = critProb === 0 ? 100 : critProb === 1 ? 50 : 0;
    factors.push({ name: 'Critical Problems', score: probScore, weight: 30, evidence: `${critProb} critical problems` });

    // Factor 2: Open gaps (weight 20)
    const critGaps = parseInt(g.critical_high || '0');
    const gapScore = critGaps === 0 ? 100 : critGaps <= 2 ? 60 : 20;
    factors.push({ name: 'Critical/High Gaps', score: gapScore, weight: 20, evidence: `${critGaps} critical/high gaps` });

    // Factor 3: Transformation health (weight 20)
    const failedTfm = parseInt(t.failed || '0');
    const tfmScore = failedTfm === 0 ? 100 : 30;
    factors.push({ name: 'Transformation Health', score: tfmScore, weight: 20, evidence: `${failedTfm} failed transformations` });

    // Factor 4: Optimization findings (weight 15)
    const unresolvedOpt = parseInt(o.unresolved || '0');
    const optScore = unresolvedOpt === 0 ? 100 : unresolvedOpt <= 3 ? 60 : 20;
    factors.push({ name: 'Optimization Findings', score: optScore, weight: 15, evidence: `${unresolvedOpt} unresolved findings` });

    // Factor 5: Lifecycle progress (weight 15)
    const advancedStates = ['managed-services', 'engineering-intelligence', 'validation-passed', 'migration-complete'];
    const lcScore = advancedStates.includes(lifecycleStatus) ? 100 : lifecycleStatus === 'unknown' ? 50 : 70;
    factors.push({ name: 'Lifecycle Progress', score: lcScore, weight: 15, evidence: `Status: ${lifecycleStatus}` });

    // Weighted score
    const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
    const weightedScore = Math.round(factors.reduce((s, f) => s + (f.score * f.weight), 0) / totalWeight);

    const health = weightedScore >= 80 ? 'Healthy' : weightedScore >= 60 ? 'Watch' : weightedScore >= 40 ? 'At Risk' : 'Critical';
    const riskLevel = weightedScore >= 80 ? 'low' : weightedScore >= 60 ? 'medium' : weightedScore >= 40 ? 'high' : 'critical';

    const topRisks: string[] = [];
    if (critProb > 0) topRisks.push(`${critProb} critical problem(s)`);
    if (critGaps > 0) topRisks.push(`${critGaps} critical/high gap(s)`);
    if (failedTfm > 0) topRisks.push(`${failedTfm} failed transformation(s)`);
    if (unresolvedOpt > 0) topRisks.push(`${unresolvedOpt} unresolved optimization finding(s)`);

    return { clientId, clientName: clientName, status: clientStatus, score: weightedScore, health, riskLevel, factors, topRisks, lifecycleStatus };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINANCIAL PORTFOLIO
  // ═══════════════════════════════════════════════════════════════════════════

  async getFinancialPortfolio(): Promise<any> {
    // Per-client financial summary
    const clientFin = await sharedPool.query(`
      SELECT f.client_id, c.name as client_name,
        COALESCE(SUM(f.implementation_cost), 0) as investment,
        COALESCE(SUM(f.annual_savings), 0) as expected_savings,
        COALESCE(AVG(f.roi_percentage), 0) as avg_roi,
        count(*) as estimates
      FROM oc_financial_estimates f
      LEFT JOIN oc_clients c ON c.id = f.client_id
      GROUP BY f.client_id, c.name
      ORDER BY SUM(f.annual_savings) DESC NULLS LAST
    `);

    // Outcome-based actuals
    const outcomeFin = await sharedPool.query(`
      SELECT client_id,
        COALESCE(SUM(actual_savings), 0) as realized,
        COALESCE(SUM(expected_savings), 0) as expected,
        COALESCE(AVG(benefit_realization_pct), 0) as avg_benefit
      FROM oc_transformation_outcomes GROUP BY client_id
    `);
    const outcomeMap: Record<string, any> = {};
    outcomeFin.rows.forEach((r: any) => { outcomeMap[r.client_id] = r; });

    // Domain ranking
    const domainFin = await sharedPool.query(`
      SELECT p.domain, COALESCE(SUM(f.annual_savings), 0) as total_savings, COALESCE(SUM(f.implementation_cost), 0) as total_investment, count(DISTINCT p.client_id) as clients
      FROM oc_financial_estimates f JOIN oc_problems p ON p.id = f.problem_id
      GROUP BY p.domain ORDER BY total_savings DESC
    `);

    const clients = clientFin.rows.map((r: any) => {
      const out = outcomeMap[r.client_id] || {};
      return {
        clientId: r.client_id, clientName: r.client_name,
        investment: parseFloat(r.investment), expectedSavings: parseFloat(r.expected_savings),
        realizedSavings: parseFloat(out.realized || '0'), avgRoi: parseFloat(parseFloat(r.avg_roi).toFixed(1)),
        benefitRealization: parseFloat(parseFloat(out.avg_benefit || '0').toFixed(1)),
        missedSavings: Math.max(0, parseFloat(out.expected || '0') - parseFloat(out.realized || '0')),
      };
    });

    const totals = {
      investment: clients.reduce((s, c) => s + c.investment, 0),
      expectedSavings: clients.reduce((s, c) => s + c.expectedSavings, 0),
      realizedSavings: clients.reduce((s, c) => s + c.realizedSavings, 0),
      missedSavings: clients.reduce((s, c) => s + c.missedSavings, 0),
    };

    return { clients, domains: domainFin.rows.map((r: any) => ({ domain: r.domain, savings: parseFloat(r.total_savings), investment: parseFloat(r.total_investment), clients: parseInt(r.clients) })), totals };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSFORMATION PORTFOLIO
  // ═══════════════════════════════════════════════════════════════════════════

  async getTransformationPortfolio(): Promise<any> {
    const tfms = await sharedPool.query(`
      SELECT t.*, c.name as client_name FROM oc_transformations t
      LEFT JOIN oc_clients c ON c.id = t.client_id
      ORDER BY t.status, t.created_at DESC
    `);

    const outcomes = await sharedPool.query(`SELECT * FROM oc_transformation_outcomes ORDER BY measured_at DESC`);
    const outcomeMap: Record<string, any> = {};
    outcomes.rows.forEach((r: any) => { if (!outcomeMap[r.transformation_id]) outcomeMap[r.transformation_id] = r; });

    const items = tfms.rows.map((r: any) => {
      const out = outcomeMap[r.id];
      return {
        id: r.id, clientId: r.client_id, clientName: r.client_name, title: r.title,
        domain: r.domain, type: r.transformation_type, status: r.status,
        investment: parseFloat(r.investment) || null, expectedSavings: parseFloat(r.expected_savings) || null,
        expectedRoi: parseFloat(r.expected_roi) || null, personDays: parseFloat(r.person_days) || null,
        duration: r.duration, startedAt: r.started_at, completedAt: r.completed_at,
        outcome: out ? { health: out.health, benefitRealization: parseFloat(out.benefit_realization_pct) || null, costVariance: parseFloat(out.cost_variance_pct) || null, actualSavings: parseFloat(out.actual_savings) || null } : null,
      };
    });

    const summary = {
      total: items.length, planned: items.filter(i => i.status === 'planned').length,
      inProgress: items.filter(i => i.status === 'in_progress').length,
      completed: items.filter(i => i.status === 'completed').length,
      failed: items.filter(i => i.status === 'failed').length,
      totalInvestment: items.reduce((s, i) => s + (i.investment || 0), 0),
      totalExpectedSavings: items.reduce((s, i) => s + (i.expectedSavings || 0), 0),
      totalPersonDays: items.reduce((s, i) => s + (i.personDays || 0), 0),
    };

    return { transformations: items, summary };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CROSS-CLIENT PATTERNS
  // ═══════════════════════════════════════════════════════════════════════════

  async getCrossClientPatterns(): Promise<{ problems: CrossClientPattern[]; gaps: CrossClientPattern[]; technologies: CrossClientPattern[] }> {
    // Repeated problems by domain+category
    const probPatterns = await sharedPool.query(`
      SELECT domain, category, count(*) as freq, count(DISTINCT client_id) as clients,
        array_agg(DISTINCT client_id) as client_ids,
        MAX(severity) as max_severity
      FROM oc_problems WHERE status NOT IN ('resolved','rejected')
      GROUP BY domain, category HAVING count(DISTINCT client_id) >= 1
      ORDER BY freq DESC LIMIT 20
    `);

    // Repeated gaps
    const gapPatterns = await sharedPool.query(`
      SELECT domain, category, count(*) as freq, count(DISTINCT client_id) as clients,
        array_agg(DISTINCT client_id) as client_ids,
        COALESCE(AVG(target_maturity - current_maturity), 0) as avg_gap,
        MAX(severity) as max_severity
      FROM oc_gaps WHERE status NOT IN ('resolved','closed','rejected')
      GROUP BY domain, category HAVING count(DISTINCT client_id) >= 1
      ORDER BY freq DESC LIMIT 20
    `);

    // Technology patterns from discovery
    const techPatterns = await sharedPool.query(`
      SELECT r.results->>'dbEngine' as technology, count(*) as freq,
        count(DISTINCT r.client_id) as clients,
        array_agg(DISTINCT r.client_id) as client_ids
      FROM oc_discovery_runs r
      WHERE r.results->>'dbEngine' IS NOT NULL
      GROUP BY r.results->>'dbEngine'
      ORDER BY freq DESC LIMIT 20
    `);

    const problems: CrossClientPattern[] = probPatterns.rows.map((r: any) => ({
      type: 'problem', key: `${r.domain}/${r.category}`, label: `${r.domain} / ${r.category}`,
      frequency: parseInt(r.freq), affectedClients: r.client_ids || [],
      financialImpact: 0, avgEffort: 0, severity: r.max_severity || 'medium',
      recommendation: `Address ${r.domain}/${r.category} problems affecting ${r.clients} client(s)`,
    }));

    const gaps: CrossClientPattern[] = gapPatterns.rows.map((r: any) => ({
      type: 'gap', key: `${r.domain}/${r.category}`, label: `${r.domain} / ${r.category}`,
      frequency: parseInt(r.freq), affectedClients: r.client_ids || [],
      financialImpact: 0, avgEffort: 0, severity: r.max_severity || 'medium',
      recommendation: `Standardize remediation for ${r.domain}/${r.category} gaps (avg maturity gap: ${parseFloat(r.avg_gap).toFixed(1)})`,
    }));

    const technologies: CrossClientPattern[] = techPatterns.rows.filter((r: any) => r.technology).map((r: any) => ({
      type: 'technology', key: r.technology, label: r.technology,
      frequency: parseInt(r.freq), affectedClients: r.client_ids || [],
      financialImpact: 0, avgEffort: 0, severity: 'info',
      recommendation: `Technology "${r.technology}" detected across ${r.clients} client(s)`,
    }));

    return { problems, gaps, technologies };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOURCE / EFFORT VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  async getResourceView(): Promise<any> {
    const effortRes = await sharedPool.query(`
      SELECT e.client_id, c.name as client_name,
        COALESCE(SUM(e.person_days), 0) as total_person_days,
        COALESCE(AVG(e.team_size), 0) as avg_team_size,
        MAX(e.complexity) as max_complexity,
        count(*) as estimates
      FROM oc_effort_estimates e
      LEFT JOIN oc_clients c ON c.id = e.client_id
      GROUP BY e.client_id, c.name
      ORDER BY SUM(e.person_days) DESC NULLS LAST
    `);

    // Active transformation effort
    const activeTfm = await sharedPool.query(`
      SELECT client_id, SUM(person_days) as active_days, count(*) as active_count
      FROM oc_transformations WHERE status IN ('planned','in_progress')
      GROUP BY client_id
    `);
    const activeMap: Record<string, any> = {};
    activeTfm.rows.forEach((r: any) => { activeMap[r.client_id] = r; });

    // Role aggregation
    const roleRes = await sharedPool.query(`
      SELECT r.value as role, count(*) as freq
      FROM oc_effort_estimates, jsonb_array_elements_text(roles) as r(value)
      GROUP BY r.value ORDER BY freq DESC LIMIT 20
    `);

    const clients = effortRes.rows.map((r: any) => {
      const active = activeMap[r.client_id] || {};
      return {
        clientId: r.client_id, clientName: r.client_name,
        totalPersonDays: parseFloat(r.total_person_days),
        avgTeamSize: parseFloat(parseFloat(r.avg_team_size).toFixed(1)),
        maxComplexity: r.max_complexity,
        activePersonDays: parseFloat(active.active_days || '0'),
        activeTransformations: parseInt(active.active_count || '0'),
      };
    });

    const totals = {
      totalPersonDays: clients.reduce((s, c) => s + c.totalPersonDays, 0),
      activePersonDays: clients.reduce((s, c) => s + c.activePersonDays, 0),
      totalClients: clients.length,
    };

    return { clients, roles: roleRes.rows.map((r: any) => ({ role: r.role, frequency: parseInt(r.freq) })), totals, dataSource: 'estimated' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENGINEERING INTELLIGENCE
  // ═══════════════════════════════════════════════════════════════════════════

  async getEngineeringIntelligence(): Promise<any> {
    const health = await this.getPortfolioHealth();
    const patterns = await this.getCrossClientPatterns();

    // Top risks
    const topRisks = await sharedPool.query(`
      SELECT p.title, p.severity, p.domain, p.client_id, c.name as client_name
      FROM oc_problems p LEFT JOIN oc_clients c ON c.id = p.client_id
      WHERE p.severity IN ('critical','high') AND p.status NOT IN ('resolved','rejected')
      ORDER BY CASE p.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, p.created_at
      LIMIT 10
    `);

    // Top financial opportunities
    const topOpportunities = await sharedPool.query(`
      SELECT f.client_id, c.name as client_name, f.annual_savings, f.roi_percentage, f.problem_id, p.title as problem_title
      FROM oc_financial_estimates f
      LEFT JOIN oc_clients c ON c.id = f.client_id
      LEFT JOIN oc_problems p ON p.id = f.problem_id
      WHERE f.annual_savings > 0
      ORDER BY f.annual_savings DESC LIMIT 10
    `);

    // Underperforming transformations
    const underperforming = await sharedPool.query(`
      SELECT o.transformation_id, o.client_id, c.name as client_name, t.title,
        o.benefit_realization_pct, o.cost_variance_pct, o.health
      FROM oc_transformation_outcomes o
      LEFT JOIN oc_clients c ON c.id = o.client_id
      LEFT JOIN oc_transformations t ON t.id = o.transformation_id
      WHERE o.health IN ('at_risk','critical') OR o.benefit_realization_pct < 70
      ORDER BY o.benefit_realization_pct ASC NULLS LAST LIMIT 10
    `);

    // Smart recommendations
    const recommendations: any[] = [];
    if (health.problems.critical > 0) {
      recommendations.push({ priority: 'critical', type: 'risk', title: `Address ${health.problems.critical} critical problem(s)`, reason: 'Critical problems indicate immediate business risk', impact: 'high', confidence: 'high' });
    }
    if (health.financial.missedSavings > 10000) {
      recommendations.push({ priority: 'high', type: 'financial', title: `Recover $${(health.financial.missedSavings / 1000).toFixed(0)}K in missed savings`, reason: 'Benefit realization below target indicates optimization opportunities', impact: 'high', confidence: 'medium' });
    }
    const topProblem = patterns.problems[0];
    if (topProblem && topProblem.frequency > 2) {
      recommendations.push({ priority: 'medium', type: 'pattern', title: `Standardize ${topProblem.label} remediation (${topProblem.frequency} instances)`, reason: 'Repeated problems suggest reusable solution opportunity', impact: 'medium', confidence: 'medium' });
    }
    if (health.gaps.open > 5) {
      recommendations.push({ priority: 'medium', type: 'gaps', title: `Prioritize ${health.gaps.open} open gaps`, reason: 'High gap count increases accumulated technical debt', impact: 'medium', confidence: 'high' });
    }

    return {
      health,
      topRisks: topRisks.rows.map((r: any) => ({ title: r.title, severity: r.severity, domain: r.domain, clientId: r.client_id, clientName: r.client_name })),
      topOpportunities: topOpportunities.rows.map((r: any) => ({ clientId: r.client_id, clientName: r.client_name, savings: parseFloat(r.annual_savings), roi: parseFloat(r.roi_percentage), problemTitle: r.problem_title })),
      underperforming: underperforming.rows.map((r: any) => ({ transformationId: r.transformation_id, clientId: r.client_id, clientName: r.client_name, title: r.title, benefitRealization: parseFloat(r.benefit_realization_pct) || null, costVariance: parseFloat(r.cost_variance_pct) || null, health: r.health })),
      patterns: { problems: patterns.problems.slice(0, 5), technologies: patterns.technologies.slice(0, 5) },
      recommendations,
    };
  }
}
