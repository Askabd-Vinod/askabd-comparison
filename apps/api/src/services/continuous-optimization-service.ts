/**
 * AskABD Continuous Optimization Service
 * Full optimization lifecycle: Baseline → Measure → Compare → Detect → Problem → Gap → Recommend
 * Reuses: Problem Universe, Gap Analysis, Financial Engine, Audit.
 * Domain-agnostic. Idempotent. Client-isolated.
 */
import { sharedPool } from './db-pool.js';
import { ProblemUniverseService } from './problem-universe-service.js';
import { GapAnalysisService } from './gap-analysis-service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MetricDefinition {
  id: string; clientId: string; transformationId?: string; domain: string;
  category: string; name: string; description?: string; unit: string;
  direction: string; dataType: string; sourceType: string; sourceConfig: any;
  thresholdWarning?: number; thresholdCritical?: number; targetValue?: number;
  measurementFrequency: string; enabled: boolean; tags: string[];
  owner?: string; lastMeasuredAt?: string; nextMeasurementAt?: string;
  createdAt: string; updatedAt: string;
}

export interface Baseline {
  id: string; clientId: string; metricId: string; transformationId?: string;
  value: number; unit: string; capturedAt: string; captureMethod: string;
  confidence: string; evidence: any[]; notes?: string; status: string;
}

export interface Measurement {
  id: string; clientId: string; metricId: string; transformationId?: string;
  value: number; unit: string; measuredAt: string; source: string;
  confidence: string; evidence: any[]; notes?: string;
  baselineValue?: number; targetValue?: number; variance?: number;
  variancePct?: number; status: string; alertLevel: string;
}

export interface OptimizationRule {
  id: string; name: string; description?: string; domain: string;
  category: string; conditionType: string; conditionConfig: any;
  severity: string; priority: string; recommendationTemplate?: string;
  enabled: boolean; scope: string; clientId?: string;
}

export interface OptimizationFinding {
  id: string; clientId: string; transformationId?: string;
  metricId?: string; measurementId?: string; ruleId?: string;
  domain: string; category: string; title: string; description?: string;
  findingType: string; severity: string; priority: string;
  baselineValue?: number; targetValue?: number; actualValue?: number;
  variance?: number; variancePct?: number; financialImpact?: number;
  potentialSavings?: number; evidence: any[]; recommendation?: string;
  recommendedAction?: string; confidence: string; status: string;
  problemId?: string; gapId?: string; owner?: string;
  detectedAt: string; acknowledgedAt?: string; resolvedAt?: string;
}

export interface TransformationOutcome {
  id: string; clientId: string; transformationId: string;
  expectedCost?: number; actualCost?: number; costVariance?: number; costVariancePct?: number;
  expectedSavings?: number; actualSavings?: number; savingsVariance?: number; savingsVariancePct?: number;
  benefitRealizationPct?: number;
  expectedDuration?: string; actualDuration?: string; scheduleVarianceDays?: number;
  expectedPerformance: any; actualPerformance: any;
  expectedAvailability?: number; actualAvailability?: number;
  expectedRiskLevel?: string; actualRiskLevel?: string;
  roiExpected?: number; roiActual?: number; roiVariance?: number;
  overallStatus: string; health: string; summary?: string;
  evidence: any[]; lessonsLearned: any[]; measuredAt: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ContinuousOptimizationService {
  private problemService = new ProblemUniverseService();
  private gapService = new GapAnalysisService();

  // ═══════════════════════════════════════════════════════════════════════════
  // METRIC DEFINITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async createMetric(clientId: string, data: Partial<MetricDefinition>): Promise<MetricDefinition> {
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_metric_definitions (client_id, transformation_id, domain, category, name, description, unit, direction, data_type, source_type, source_config, threshold_warning, threshold_critical, target_value, measurement_frequency, enabled, tags, owner)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *
    `, [clientId, data.transformationId || null, data.domain || 'general', data.category || 'performance',
      data.name || 'Unnamed Metric', data.description || null, data.unit || 'count',
      data.direction || 'lower_is_better', data.dataType || 'numeric',
      data.sourceType || 'manual', JSON.stringify(data.sourceConfig || {}),
      data.thresholdWarning ?? null, data.thresholdCritical ?? null, data.targetValue ?? null,
      data.measurementFrequency || 'daily', data.enabled !== false,
      JSON.stringify(data.tags || []), data.owner || null]);
    return this.mapMetric(rows[0]);
  }

  async getMetrics(clientId: string, filters?: { domain?: string; category?: string; enabled?: boolean; transformationId?: string }): Promise<MetricDefinition[]> {
    let where = 'WHERE client_id = $1';
    const params: any[] = [clientId]; let idx = 2;
    if (filters?.domain) { where += ` AND domain = $${idx++}`; params.push(filters.domain); }
    if (filters?.category) { where += ` AND category = $${idx++}`; params.push(filters.category); }
    if (filters?.enabled !== undefined) { where += ` AND enabled = $${idx++}`; params.push(filters.enabled); }
    if (filters?.transformationId) { where += ` AND transformation_id = $${idx++}`; params.push(filters.transformationId); }
    const { rows } = await sharedPool.query(`SELECT * FROM oc_metric_definitions ${where} ORDER BY domain, category, name`, params);
    return rows.map(this.mapMetric);
  }

  async getMetric(metricId: string): Promise<MetricDefinition | null> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_metric_definitions WHERE id = $1', [metricId]);
    return rows.length > 0 ? this.mapMetric(rows[0]) : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BASELINES
  // ═══════════════════════════════════════════════════════════════════════════

  async captureBaseline(clientId: string, data: { metricId: string; value: number; transformationId?: string; captureMethod?: string; confidence?: string; evidence?: any[]; notes?: string }): Promise<Baseline> {
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_baselines (client_id, metric_id, transformation_id, value, unit, capture_method, confidence, evidence, notes, status)
      VALUES ($1,$2,$3,$4,(SELECT unit FROM oc_metric_definitions WHERE id = $2),$5,$6,$7,$8,'active') RETURNING *
    `, [clientId, data.metricId, data.transformationId || null, data.value,
      data.captureMethod || 'manual', data.confidence || 'medium',
      JSON.stringify(data.evidence || []), data.notes || null]);
    return this.mapBaseline(rows[0]);
  }

  async getBaselines(clientId: string, metricId?: string): Promise<Baseline[]> {
    const where = metricId ? 'WHERE client_id = $1 AND metric_id = $2' : 'WHERE client_id = $1';
    const params = metricId ? [clientId, metricId] : [clientId];
    const { rows } = await sharedPool.query(`SELECT * FROM oc_baselines ${where} ORDER BY captured_at DESC`, params);
    return rows.map(this.mapBaseline);
  }

  async getActiveBaseline(clientId: string, metricId: string): Promise<Baseline | null> {
    const { rows } = await sharedPool.query(
      `SELECT * FROM oc_baselines WHERE client_id = $1 AND metric_id = $2 AND status = 'active' ORDER BY captured_at DESC LIMIT 1`,
      [clientId, metricId]);
    return rows.length > 0 ? this.mapBaseline(rows[0]) : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MEASUREMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  async recordMeasurement(clientId: string, data: { metricId: string; value: number; transformationId?: string; source?: string; confidence?: string; evidence?: any[]; notes?: string }): Promise<{ measurement: Measurement; findings: OptimizationFinding[] }> {
    // Get metric definition
    const metric = await this.getMetric(data.metricId);
    if (!metric) throw new Error(`Metric ${data.metricId} not found`);

    // Get active baseline for comparison
    const baseline = await this.getActiveBaseline(clientId, data.metricId);
    const baselineValue = baseline?.value ?? null;
    const targetValue = metric.targetValue ?? null;

    // Calculate variance from baseline
    let variance: number | null = null;
    let variancePct: number | null = null;
    if (baselineValue !== null) {
      variance = data.value - baselineValue;
      variancePct = baselineValue !== 0 ? (variance / baselineValue) * 100 : null;
    }

    // Determine alert level
    let alertLevel = 'none';
    if (metric.thresholdCritical !== null && metric.thresholdCritical !== undefined) {
      if (metric.direction === 'lower_is_better' && data.value > metric.thresholdCritical) alertLevel = 'critical';
      else if (metric.direction === 'higher_is_better' && data.value < metric.thresholdCritical) alertLevel = 'critical';
    }
    if (alertLevel === 'none' && metric.thresholdWarning !== null && metric.thresholdWarning !== undefined) {
      if (metric.direction === 'lower_is_better' && data.value > metric.thresholdWarning) alertLevel = 'warning';
      else if (metric.direction === 'higher_is_better' && data.value < metric.thresholdWarning) alertLevel = 'warning';
    }

    const { rows } = await sharedPool.query(`
      INSERT INTO oc_measurements (client_id, metric_id, transformation_id, value, unit, source, confidence, evidence, notes, baseline_value, target_value, variance, variance_pct, status, alert_level)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'recorded',$14) RETURNING *
    `, [clientId, data.metricId, data.transformationId || metric.transformationId || null,
      data.value, metric.unit, data.source || 'manual', data.confidence || 'medium',
      JSON.stringify(data.evidence || []), data.notes || null,
      baselineValue, targetValue, variance, variancePct, alertLevel]);

    // Update metric last_measured_at
    await sharedPool.query('UPDATE oc_metric_definitions SET last_measured_at = NOW(), updated_at = NOW() WHERE id = $1', [data.metricId]);

    const measurement = this.mapMeasurement(rows[0]);

    // Run optimization rules against this measurement
    const findings = await this.evaluateRules(clientId, metric, measurement, baseline);

    return { measurement, findings };
  }

  async getMeasurements(clientId: string, metricId?: string, limit?: number): Promise<Measurement[]> {
    const where = metricId ? 'WHERE client_id = $1 AND metric_id = $2' : 'WHERE client_id = $1';
    const params = metricId ? [clientId, metricId] : [clientId];
    const { rows } = await sharedPool.query(`SELECT * FROM oc_measurements ${where} ORDER BY measured_at DESC LIMIT ${limit || 100}`, params);
    return rows.map(this.mapMeasurement);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIMIZATION RULES
  // ═══════════════════════════════════════════════════════════════════════════

  async getRules(filters?: { domain?: string; enabled?: boolean; scope?: string }): Promise<OptimizationRule[]> {
    let where = 'WHERE 1=1';
    const params: any[] = []; let idx = 1;
    if (filters?.domain) { where += ` AND domain = $${idx++}`; params.push(filters.domain); }
    if (filters?.enabled !== undefined) { where += ` AND enabled = $${idx++}`; params.push(filters.enabled); }
    if (filters?.scope) { where += ` AND scope = $${idx++}`; params.push(filters.scope); }
    const { rows } = await sharedPool.query(`SELECT * FROM oc_optimization_rules ${where} ORDER BY priority DESC, name`, params);
    return rows.map(this.mapRule);
  }

  async createRule(data: Partial<OptimizationRule>): Promise<OptimizationRule> {
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_optimization_rules (name, description, domain, category, condition_type, condition_config, severity, priority, recommendation_template, enabled, scope, client_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
    `, [data.name || 'Custom Rule', data.description, data.domain || 'general',
      data.category || 'performance', data.conditionType || 'threshold',
      JSON.stringify(data.conditionConfig || {}), data.severity || 'medium',
      data.priority || 'medium', data.recommendationTemplate || null,
      data.enabled !== false, data.scope || 'global', data.clientId || null]);
    return this.mapRule(rows[0]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RULE EVALUATION ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  private async evaluateRules(clientId: string, metric: MetricDefinition, measurement: Measurement, baseline: Baseline | null): Promise<OptimizationFinding[]> {
    const rules = await this.getRules({ enabled: true });
    const findings: OptimizationFinding[] = [];

    for (const rule of rules) {
      // Skip rules that don't match this metric's category/domain
      const config = rule.conditionConfig || {};
      if (config.metric_category && config.metric_category !== metric.category) continue;
      if (rule.domain !== 'general' && rule.domain !== metric.domain) continue;
      if (rule.clientId && rule.clientId !== clientId) continue;

      const triggered = this.checkRuleCondition(rule, metric, measurement, baseline);
      if (!triggered) continue;

      // IDEMPOTENCY: check if finding already exists for this metric+rule+client in active state
      const dupCheck = await sharedPool.query(
        `SELECT id FROM oc_optimization_findings WHERE client_id = $1 AND metric_id = $2 AND rule_id = $3 AND status IN ('detected','acknowledged','promoted') LIMIT 1`,
        [clientId, metric.id, rule.id]);
      if (dupCheck.rows.length > 0) continue;

      // Create finding
      const finding = await this.createFinding(clientId, {
        transformationId: metric.transformationId,
        metricId: metric.id,
        measurementId: measurement.id,
        ruleId: rule.id,
        domain: metric.domain,
        category: metric.category,
        title: `${rule.name}: ${metric.name}`,
        description: `Rule "${rule.name}" triggered for metric "${metric.name}". ${rule.description || ''}`,
        findingType: rule.conditionType === 'deviation' ? 'deviation' : 'threshold_violation',
        severity: rule.severity,
        priority: rule.priority,
        baselineValue: baseline?.value,
        targetValue: metric.targetValue,
        actualValue: measurement.value,
        variance: measurement.variance,
        variancePct: measurement.variancePct,
        recommendation: rule.recommendationTemplate,
        confidence: measurement.confidence as any,
      });
      findings.push(finding);
    }
    return findings;
  }

  private checkRuleCondition(rule: OptimizationRule, metric: MetricDefinition, measurement: Measurement, baseline: Baseline | null): boolean {
    const config = rule.conditionConfig || {};
    const thresholdPct = config.threshold_pct ?? 10;

    switch (rule.conditionType) {
      case 'threshold_exceeded': {
        if (metric.direction === 'lower_is_better') {
          const threshold = baseline ? baseline.value * (1 + thresholdPct / 100) : (metric.thresholdWarning ?? Infinity);
          return measurement.value > threshold;
        } else {
          // For "higher is better", threshold_exceeded means it dropped below
          const threshold = baseline ? baseline.value * (1 - thresholdPct / 100) : (metric.thresholdWarning ?? 0);
          return measurement.value < threshold;
        }
      }
      case 'below_target': {
        if (metric.targetValue === null || metric.targetValue === undefined) return false;
        if (metric.direction === 'higher_is_better') {
          const threshold = metric.targetValue * (1 - thresholdPct / 100);
          return measurement.value < threshold;
        } else {
          const threshold = metric.targetValue * (1 + thresholdPct / 100);
          return measurement.value > threshold;
        }
      }
      case 'deviation': {
        if (!baseline) return false;
        const absVariancePct = Math.abs((measurement.value - baseline.value) / baseline.value * 100);
        return absVariancePct > thresholdPct;
      }
      default:
        return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINDINGS
  // ═══════════════════════════════════════════════════════════════════════════

  async createFinding(clientId: string, data: Partial<OptimizationFinding>): Promise<OptimizationFinding> {
    const { rows } = await sharedPool.query(`
      INSERT INTO oc_optimization_findings (client_id, transformation_id, metric_id, measurement_id, rule_id, domain, category, title, description, finding_type, severity, priority, baseline_value, target_value, actual_value, variance, variance_pct, financial_impact, potential_savings, evidence, recommendation, recommended_action, confidence, status, owner)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *
    `, [clientId, data.transformationId, data.metricId, data.measurementId, data.ruleId,
      data.domain || 'general', data.category || 'performance',
      data.title || 'Optimization Finding', data.description,
      data.findingType || 'deviation', data.severity || 'medium', data.priority || 'medium',
      data.baselineValue ?? null, data.targetValue ?? null, data.actualValue ?? null,
      data.variance ?? null, data.variancePct ?? null,
      data.financialImpact ?? null, data.potentialSavings ?? null,
      JSON.stringify(data.evidence || []), data.recommendation, data.recommendedAction,
      data.confidence || 'medium', 'detected', data.owner || null]);
    return this.mapFinding(rows[0]);
  }

  async getFindings(clientId: string, filters?: { status?: string; severity?: string; transformationId?: string; limit?: number }): Promise<OptimizationFinding[]> {
    let where = 'WHERE client_id = $1';
    const params: any[] = [clientId]; let idx = 2;
    if (filters?.status) { where += ` AND status = $${idx++}`; params.push(filters.status); }
    if (filters?.severity) { where += ` AND severity = $${idx++}`; params.push(filters.severity); }
    if (filters?.transformationId) { where += ` AND transformation_id = $${idx++}`; params.push(filters.transformationId); }
    const limit = filters?.limit || 50;
    const { rows } = await sharedPool.query(`SELECT * FROM oc_optimization_findings ${where} ORDER BY severity DESC, detected_at DESC LIMIT ${limit}`, params);
    return rows.map(this.mapFinding);
  }

  /** Promote a finding to a Problem in Problem Universe (idempotent) */
  async promoteToProlem(findingId: string): Promise<{ problemId: string; alreadyExists: boolean }> {
    const finding = await this.getFinding(findingId);
    if (!finding) throw new Error('Finding not found');

    // Idempotent: check if problem already linked
    if (finding.problemId) return { problemId: finding.problemId, alreadyExists: true };

    // Dedup: check if problem already exists for this finding
    const dup = await sharedPool.query(
      `SELECT id FROM oc_problems WHERE client_id = $1 AND source_type = 'optimization' AND source_id = $2 LIMIT 1`,
      [finding.clientId, finding.id]);
    if (dup.rows.length > 0) {
      await sharedPool.query('UPDATE oc_optimization_findings SET problem_id = $1, status = $2, updated_at = NOW() WHERE id = $3', [dup.rows[0].id, 'promoted', findingId]);
      return { problemId: dup.rows[0].id, alreadyExists: true };
    }

    // Create problem via existing Problem Universe Service
    const problem = await this.problemService.createProblem(finding.clientId, {
      domain: finding.domain,
      category: finding.category,
      title: finding.title,
      description: finding.description || `Optimization finding: ${finding.title}`,
      severity: finding.severity as any,
      priority: finding.priority as any,
      riskLevel: finding.severity as any,
      sourceType: 'optimization',
      sourceId: finding.id,
      technicalImpact: finding.recommendation || undefined,
      businessImpact: finding.financialImpact ? `Estimated impact: $${finding.financialImpact.toLocaleString()}` : undefined,
      evidence: [{ source: 'optimization', findingId: finding.id, metric: finding.metricId, baseline: finding.baselineValue, actual: finding.actualValue, variance: finding.variancePct, timestamp: new Date().toISOString() }],
    });

    // Link finding to problem
    await sharedPool.query('UPDATE oc_optimization_findings SET problem_id = $1, status = $2, updated_at = NOW() WHERE id = $3', [problem.id, 'promoted', findingId]);

    return { problemId: problem.id, alreadyExists: false };
  }

  /** Promote finding → Problem → Gap (full chain, idempotent) */
  async promoteToGap(findingId: string): Promise<{ problemId: string; gapId: string; alreadyExists: boolean }> {
    const { problemId } = await this.promoteToProlem(findingId);

    // Check if gap already exists for this problem
    const dupGap = await sharedPool.query(
      `SELECT id FROM oc_gaps WHERE client_id = (SELECT client_id FROM oc_problems WHERE id = $1) AND related_problem_id = $1 LIMIT 1`, [problemId]);
    if (dupGap.rows.length > 0) {
      await sharedPool.query('UPDATE oc_optimization_findings SET gap_id = $1, updated_at = NOW() WHERE id = $2', [dupGap.rows[0].id, findingId]);
      return { problemId, gapId: dupGap.rows[0].id, alreadyExists: true };
    }

    // Get the problem to extract client_id
    const problem = await this.problemService.getProblem(problemId);
    if (!problem) throw new Error('Problem not found after creation');

    const gap = await this.gapService.createGap(problem.clientId, {
      domain: problem.domain,
      category: problem.category,
      title: `Optimization Gap: ${problem.title}`,
      description: problem.description,
      currentState: `Actual: ${problem.technicalImpact || 'deviation detected'}`,
      businessImpact: problem.businessImpact,
      technicalImpact: problem.technicalImpact,
      riskLevel: problem.riskLevel as any,
      severity: problem.severity as any,
      priority: problem.priority as any,
      relatedProblemId: problemId,
      confidence: problem.confidence as any,
      sourceType: 'optimization',
      sourceId: findingId,
      evidence: problem.evidence,
    });

    await sharedPool.query('UPDATE oc_optimization_findings SET gap_id = $1, updated_at = NOW() WHERE id = $2', [gap.id, findingId]);
    return { problemId, gapId: gap.id, alreadyExists: false };
  }

  async getFinding(findingId: string): Promise<OptimizationFinding | null> {
    const { rows } = await sharedPool.query('SELECT * FROM oc_optimization_findings WHERE id = $1', [findingId]);
    return rows.length > 0 ? this.mapFinding(rows[0]) : null;
  }

  async acknowledgeFinding(findingId: string, _actor: string): Promise<OptimizationFinding | null> {
    const { rows } = await sharedPool.query(
      `UPDATE oc_optimization_findings SET status = 'acknowledged', acknowledged_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`, [findingId]);
    return rows.length > 0 ? this.mapFinding(rows[0]) : null;
  }

  async resolveFinding(findingId: string, _actor: string): Promise<OptimizationFinding | null> {
    const { rows } = await sharedPool.query(
      `UPDATE oc_optimization_findings SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`, [findingId]);
    return rows.length > 0 ? this.mapFinding(rows[0]) : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSFORMATION OUTCOMES
  // ═══════════════════════════════════════════════════════════════════════════

  async recordOutcome(clientId: string, data: Partial<TransformationOutcome>): Promise<TransformationOutcome> {
    if (!data.transformationId) throw new Error('transformationId required');

    // Calculate variances
    const costVariance = (data.actualCost != null && data.expectedCost != null) ? data.actualCost - data.expectedCost : null;
    const costVariancePct = (costVariance != null && data.expectedCost && data.expectedCost > 0) ? (costVariance / data.expectedCost) * 100 : null;
    const savingsVariance = (data.actualSavings != null && data.expectedSavings != null) ? data.actualSavings - data.expectedSavings : null;
    const savingsVariancePct = (savingsVariance != null && data.expectedSavings && data.expectedSavings > 0) ? (savingsVariance / data.expectedSavings) * 100 : null;
    const benefitRealization = (data.actualSavings != null && data.expectedSavings && data.expectedSavings > 0) ? (data.actualSavings / data.expectedSavings) * 100 : null;
    const roiVariance = (data.roiActual != null && data.roiExpected != null) ? data.roiActual - data.roiExpected : null;

    // Determine health
    let health = 'on_track';
    if (costVariancePct !== null && costVariancePct > 20) health = 'at_risk';
    if (savingsVariancePct !== null && savingsVariancePct < -20) health = 'at_risk';
    if (costVariancePct !== null && costVariancePct > 50) health = 'critical';
    if (benefitRealization !== null && benefitRealization < 50) health = 'critical';

    const { rows } = await sharedPool.query(`
      INSERT INTO oc_transformation_outcomes (client_id, transformation_id, expected_cost, actual_cost, cost_variance, cost_variance_pct, expected_savings, actual_savings, savings_variance, savings_variance_pct, benefit_realization_pct, expected_duration, actual_duration, schedule_variance_days, expected_performance, actual_performance, expected_availability, actual_availability, expected_risk_level, actual_risk_level, roi_expected, roi_actual, roi_variance, overall_status, health, summary, evidence, lessons_learned)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28) RETURNING *
    `, [clientId, data.transformationId,
      data.expectedCost ?? null, data.actualCost ?? null, costVariance, costVariancePct,
      data.expectedSavings ?? null, data.actualSavings ?? null, savingsVariance, savingsVariancePct,
      benefitRealization, data.expectedDuration, data.actualDuration, data.scheduleVarianceDays ?? null,
      JSON.stringify(data.expectedPerformance || {}), JSON.stringify(data.actualPerformance || {}),
      data.expectedAvailability ?? null, data.actualAvailability ?? null,
      data.expectedRiskLevel || null, data.actualRiskLevel || null,
      data.roiExpected ?? null, data.roiActual ?? null, roiVariance,
      data.overallStatus || 'measuring', health,
      data.summary || null, JSON.stringify(data.evidence || []), JSON.stringify(data.lessonsLearned || [])]);
    return this.mapOutcome(rows[0]);
  }

  async getOutcomes(clientId: string, transformationId?: string): Promise<TransformationOutcome[]> {
    const where = transformationId ? 'WHERE client_id = $1 AND transformation_id = $2' : 'WHERE client_id = $1';
    const params = transformationId ? [clientId, transformationId] : [clientId];
    const { rows } = await sharedPool.query(`SELECT * FROM oc_transformation_outcomes ${where} ORDER BY measured_at DESC`, params);
    return rows.map(this.mapOutcome);
  }

  async getLatestOutcome(transformationId: string): Promise<TransformationOutcome | null> {
    const { rows } = await sharedPool.query(
      'SELECT * FROM oc_transformation_outcomes WHERE transformation_id = $1 ORDER BY measured_at DESC LIMIT 1', [transformationId]);
    return rows.length > 0 ? this.mapOutcome(rows[0]) : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT OPTIMIZATION SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  async getClientSummary(clientId: string): Promise<any> {
    const [metricRes, findingRes, outcomeRes, measureRes] = await Promise.all([
      sharedPool.query(`SELECT count(*) as total, count(*) FILTER (WHERE enabled) as active FROM oc_metric_definitions WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT count(*) as total, count(*) FILTER (WHERE status = 'detected') as open, count(*) FILTER (WHERE severity IN ('critical','high')) as critical_high, COALESCE(SUM(potential_savings), 0) as total_potential_savings FROM oc_optimization_findings WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT count(*) as total, COALESCE(AVG(benefit_realization_pct), 0) as avg_benefit, count(*) FILTER (WHERE health = 'on_track') as on_track, count(*) FILTER (WHERE health = 'at_risk') as at_risk, count(*) FILTER (WHERE health = 'critical') as critical, COALESCE(SUM(actual_savings), 0) as total_realized_savings, COALESCE(SUM(expected_savings), 0) as total_expected_savings FROM oc_transformation_outcomes WHERE client_id = $1`, [clientId]),
      sharedPool.query(`SELECT count(*) as total FROM oc_measurements WHERE client_id = $1`, [clientId]),
    ]);

    const m = metricRes.rows[0] || {};
    const f = findingRes.rows[0] || {};
    const o = outcomeRes.rows[0] || {};
    const ms = measureRes.rows[0] || {};

    const expectedSavings = parseFloat(o.total_expected_savings || '0');
    const realizedSavings = parseFloat(o.total_realized_savings || '0');
    const missedSavings = Math.max(0, expectedSavings - realizedSavings);

    return {
      clientId,
      metrics: { total: parseInt(m.total || '0'), active: parseInt(m.active || '0') },
      measurements: { total: parseInt(ms.total || '0') },
      findings: { total: parseInt(f.total || '0'), open: parseInt(f.open || '0'), criticalHigh: parseInt(f.critical_high || '0'), potentialSavings: parseFloat(f.total_potential_savings || '0') },
      outcomes: { total: parseInt(o.total || '0'), onTrack: parseInt(o.on_track || '0'), atRisk: parseInt(o.at_risk || '0'), critical: parseInt(o.critical || '0'), avgBenefitRealization: parseFloat(parseFloat(o.avg_benefit || '0').toFixed(1)) },
      savings: { expected: expectedSavings, realized: realizedSavings, missed: missedSavings },
      health: parseInt(o.critical || '0') > 0 ? 'critical' : parseInt(o.at_risk || '0') > 0 ? 'at_risk' : parseInt(f.open || '0') > 0 ? 'needs_attention' : 'healthy',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MONITORING STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  async getMonitoringStatus(clientId: string): Promise<any> {
    const metrics = await this.getMetrics(clientId, { enabled: true });
    const now = new Date();
    const overdue: any[] = [];
    const healthy: any[] = [];

    for (const m of metrics) {
      if (m.lastMeasuredAt) {
        const last = new Date(m.lastMeasuredAt);
        const freqMs = this.frequencyToMs(m.measurementFrequency);
        if (now.getTime() - last.getTime() > freqMs * 1.5) {
          overdue.push({ id: m.id, name: m.name, lastMeasured: m.lastMeasuredAt, frequency: m.measurementFrequency });
        } else {
          healthy.push({ id: m.id, name: m.name, lastMeasured: m.lastMeasuredAt });
        }
      } else {
        overdue.push({ id: m.id, name: m.name, lastMeasured: null, frequency: m.measurementFrequency, reason: 'never_measured' });
      }
    }

    return { clientId, totalMetrics: metrics.length, healthy: healthy.length, overdue: overdue.length, overdueMetrics: overdue, status: overdue.length === 0 ? 'healthy' : overdue.length > metrics.length / 2 ? 'degraded' : 'partial' };
  }

  private frequencyToMs(freq: string): number {
    switch (freq) {
      case 'hourly': return 3600000;
      case 'daily': return 86400000;
      case 'weekly': return 604800000;
      case 'monthly': return 2592000000;
      default: return 86400000;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAPPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private mapMetric(row: any): MetricDefinition {
    return { id: row.id, clientId: row.client_id, transformationId: row.transformation_id, domain: row.domain, category: row.category, name: row.name, description: row.description, unit: row.unit, direction: row.direction, dataType: row.data_type, sourceType: row.source_type, sourceConfig: row.source_config || {}, thresholdWarning: row.threshold_warning != null ? parseFloat(row.threshold_warning) : undefined, thresholdCritical: row.threshold_critical != null ? parseFloat(row.threshold_critical) : undefined, targetValue: row.target_value != null ? parseFloat(row.target_value) : undefined, measurementFrequency: row.measurement_frequency, enabled: row.enabled, tags: row.tags || [], owner: row.owner, lastMeasuredAt: row.last_measured_at, nextMeasurementAt: row.next_measurement_at, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  private mapBaseline(row: any): Baseline {
    return { id: row.id, clientId: row.client_id, metricId: row.metric_id, transformationId: row.transformation_id, value: parseFloat(row.value), unit: row.unit, capturedAt: row.captured_at, captureMethod: row.capture_method, confidence: row.confidence, evidence: row.evidence || [], notes: row.notes, status: row.status };
  }

  private mapMeasurement(row: any): Measurement {
    return { id: row.id, clientId: row.client_id, metricId: row.metric_id, transformationId: row.transformation_id, value: parseFloat(row.value), unit: row.unit, measuredAt: row.measured_at, source: row.source, confidence: row.confidence, evidence: row.evidence || [], notes: row.notes, baselineValue: row.baseline_value != null ? parseFloat(row.baseline_value) : undefined, targetValue: row.target_value != null ? parseFloat(row.target_value) : undefined, variance: row.variance != null ? parseFloat(row.variance) : undefined, variancePct: row.variance_pct != null ? parseFloat(row.variance_pct) : undefined, status: row.status, alertLevel: row.alert_level };
  }

  private mapRule(row: any): OptimizationRule {
    return { id: row.id, name: row.name, description: row.description, domain: row.domain, category: row.category, conditionType: row.condition_type, conditionConfig: row.condition_config || {}, severity: row.severity, priority: row.priority, recommendationTemplate: row.recommendation_template, enabled: row.enabled, scope: row.scope, clientId: row.client_id };
  }

  private mapFinding(row: any): OptimizationFinding {
    return { id: row.id, clientId: row.client_id, transformationId: row.transformation_id, metricId: row.metric_id, measurementId: row.measurement_id, ruleId: row.rule_id, domain: row.domain, category: row.category, title: row.title, description: row.description, findingType: row.finding_type, severity: row.severity, priority: row.priority, baselineValue: row.baseline_value != null ? parseFloat(row.baseline_value) : undefined, targetValue: row.target_value != null ? parseFloat(row.target_value) : undefined, actualValue: row.actual_value != null ? parseFloat(row.actual_value) : undefined, variance: row.variance != null ? parseFloat(row.variance) : undefined, variancePct: row.variance_pct != null ? parseFloat(row.variance_pct) : undefined, financialImpact: row.financial_impact != null ? parseFloat(row.financial_impact) : undefined, potentialSavings: row.potential_savings != null ? parseFloat(row.potential_savings) : undefined, evidence: row.evidence || [], recommendation: row.recommendation, recommendedAction: row.recommended_action, confidence: row.confidence, status: row.status, problemId: row.problem_id, gapId: row.gap_id, owner: row.owner, detectedAt: row.detected_at, acknowledgedAt: row.acknowledged_at, resolvedAt: row.resolved_at };
  }

  private mapOutcome(row: any): TransformationOutcome {
    return { id: row.id, clientId: row.client_id, transformationId: row.transformation_id, expectedCost: row.expected_cost != null ? parseFloat(row.expected_cost) : undefined, actualCost: row.actual_cost != null ? parseFloat(row.actual_cost) : undefined, costVariance: row.cost_variance != null ? parseFloat(row.cost_variance) : undefined, costVariancePct: row.cost_variance_pct != null ? parseFloat(row.cost_variance_pct) : undefined, expectedSavings: row.expected_savings != null ? parseFloat(row.expected_savings) : undefined, actualSavings: row.actual_savings != null ? parseFloat(row.actual_savings) : undefined, savingsVariance: row.savings_variance != null ? parseFloat(row.savings_variance) : undefined, savingsVariancePct: row.savings_variance_pct != null ? parseFloat(row.savings_variance_pct) : undefined, benefitRealizationPct: row.benefit_realization_pct != null ? parseFloat(row.benefit_realization_pct) : undefined, expectedDuration: row.expected_duration, actualDuration: row.actual_duration, scheduleVarianceDays: row.schedule_variance_days, expectedPerformance: row.expected_performance || {}, actualPerformance: row.actual_performance || {}, expectedAvailability: row.expected_availability != null ? parseFloat(row.expected_availability) : undefined, actualAvailability: row.actual_availability != null ? parseFloat(row.actual_availability) : undefined, expectedRiskLevel: row.expected_risk_level, actualRiskLevel: row.actual_risk_level, roiExpected: row.roi_expected != null ? parseFloat(row.roi_expected) : undefined, roiActual: row.roi_actual != null ? parseFloat(row.roi_actual) : undefined, roiVariance: row.roi_variance != null ? parseFloat(row.roi_variance) : undefined, overallStatus: row.overall_status, health: row.health, summary: row.summary, evidence: row.evidence || [], lessonsLearned: row.lessons_learned || [], measuredAt: row.measured_at };
  }
}
