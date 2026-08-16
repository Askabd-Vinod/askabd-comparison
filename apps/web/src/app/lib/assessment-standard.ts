/**
 * AskABD Enterprise Analysis, Evidence & Reporting Standard
 *
 * Every module must produce output conforming to this standard.
 * Every conclusion must reference evidence.
 * Every recommendation must be traceable.
 * Never generate conclusions without evidence.
 * Never recommend unsupported actions.
 * Never hide uncertainty.
 */

export type ConfidenceLevel = 'very-high' | 'high' | 'medium' | 'low' | 'very-low';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type Severity = 'critical' | 'major' | 'minor' | 'informational';

export interface Evidence {
  id: string;
  type: 'log' | 'metric' | 'incident' | 'deployment' | 'audit' | 'configuration' | 'architecture' | 'document' | 'report' | 'monitoring' | 'screenshot';
  source: string;
  description: string;
  date: string;
  owner: string;
  quality: ConfidenceLevel;
  completeness: number; // 0-100
}

export interface GapItem {
  category: string;
  item: string;
  businessImpact: string;
  technicalImpact: string;
  priority: Priority;
  risk: string;
}

export interface Recommendation {
  id: string;
  title: string;
  businessReason: string;
  technicalReason: string;
  priority: Priority;
  estimatedEffort: string;
  businessValue: string;
  expectedBenefit: string;
  dependencies: string[];
  owner: string;
  timeline: string;
  validationCriteria: string;
  successCriteria: string;
  evidenceRefs: string[]; // Evidence IDs supporting this recommendation
}

export interface AssessmentReport {
  // Section 1: Executive Summary
  executiveSummary: {
    businessSummary: string;
    technicalSummary: string;
    currentHealth: string;
    overallStatus: string;
    overallRisk: Priority;
    overallPriority: Priority;
    businessImpact: string;
    technicalImpact: string;
  };
  // Section 2: Evidence
  evidence: Evidence[];
  evidenceCompleteness: number; // 0-100
  // Section 3: Current State
  currentState: {
    dimension: string;
    score: number;
    status: string;
    summary: string;
  }[];
  // Section 4: Gap Analysis
  gaps: GapItem[];
  // Section 5: Supported Conclusions
  conclusions: { statement: string; evidenceRefs: string[]; confidence: ConfidenceLevel }[];
  // Section 6: Cannot Conclude (limitations)
  limitations: { area: string; reason: string; missingInfo: string; impact: string }[];
  // Section 7: Confidence
  overallConfidence: ConfidenceLevel;
  confidenceRationale: string;
  // Section 8: Impact
  impacts: { type: string; description: string; severity: Severity }[];
  // Section 9: Recommendations
  recommendations: Recommendation[];
  // Metadata
  assessmentDate: string;
  assessor: string;
  clientId: string;
  clientName: string;
}

export function getConfidenceColor(level: ConfidenceLevel): string {
  switch (level) {
    case 'very-high': return 'text-green-700 bg-green-50 border-green-200';
    case 'high': return 'text-green-600 bg-green-50 border-green-200';
    case 'medium': return 'text-orange-600 bg-orange-50 border-orange-200';
    case 'low': return 'text-red-600 bg-red-50 border-red-200';
    case 'very-low': return 'text-red-700 bg-red-50 border-red-200';
  }
}

export function getConfidencePercent(level: ConfidenceLevel): number {
  switch (level) {
    case 'very-high': return 95;
    case 'high': return 80;
    case 'medium': return 60;
    case 'low': return 40;
    case 'very-low': return 20;
  }
}
