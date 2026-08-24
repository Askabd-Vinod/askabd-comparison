/**
 * Data Mapping Engine — `data_mapping_test_1` (2026-08-24 master
 * completion directive, capability #74). Deliberately consolidated with
 * #41 "Migration Mapping Engine" — the directive's own explicit
 * "do not create duplicate engines" mandate applies directly: a
 * migration's field mapping IS a real data mapping set, no separate
 * engine invented for it. A future Migration Platform pass reuses
 * `DataMappingEngine` directly rather than building its own.
 *
 * Genuinely NEW (confirmed by search before building: no
 * FieldMapping/DataMapping concept existed anywhere).
 *
 * Real, enforced shape validation per mapping type (never accepted
 * silently): `one_to_one` requires exactly 1 source + 1 target field;
 * `one_to_many` requires 1 source + 2+ targets; `many_to_one` requires 2+
 * sources + 1 target; `calculated` requires a real, non-empty
 * transformation expression; `conditional` requires a real, non-empty
 * condition; `lookup` requires a real lookup table + key.
 */
import { sharedPool } from './db-pool.js';

export type MappingSetStatus = 'draft' | 'approved' | 'implemented' | 'validated' | 'deprecated';
export type MappingType = 'one_to_one' | 'one_to_many' | 'many_to_one' | 'calculated' | 'conditional' | 'lookup';

export interface MappingSet {
  id: string; clientId: string; name: string; description: string; sourceSystem: string; targetSystem: string;
  status: MappingSetStatus; owner: string | null; createdBy: string | null; createdAt: string; updatedAt: string;
}
export interface FieldMapping {
  id: string; mappingSetId: string; clientId: string; mappingType: MappingType;
  sourceFields: string[]; targetFields: string[]; transformation: string; businessRule: string;
  dataType: string | null; nullable: boolean; defaultValue: string | null; validation: string;
  lookupTable: string | null; lookupKey: string | null; condition: string | null; dependency: string;
  owner: string | null; status: MappingSetStatus; createdBy: string | null; createdAt: string; updatedAt: string;
}

type SetRow = {
  id: string; client_id: string; name: string; description: string; source_system: string; target_system: string;
  status: MappingSetStatus; owner: string | null; created_by: string | null; created_at: Date; updated_at: Date;
};
type FieldRow = {
  id: string; mapping_set_id: string; client_id: string; mapping_type: MappingType;
  source_fields: string[]; target_fields: string[]; transformation: string; business_rule: string;
  data_type: string | null; nullable: boolean; default_value: string | null; validation: string;
  lookup_table: string | null; lookup_key: string | null; condition: string | null; dependency: string;
  owner: string | null; status: MappingSetStatus; created_by: string | null; created_at: Date; updated_at: Date;
};

function toSet(r: SetRow): MappingSet {
  return { id: r.id, clientId: r.client_id, name: r.name, description: r.description, sourceSystem: r.source_system, targetSystem: r.target_system, status: r.status, owner: r.owner, createdBy: r.created_by, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString() };
}
function toField(r: FieldRow): FieldMapping {
  return {
    id: r.id, mappingSetId: r.mapping_set_id, clientId: r.client_id, mappingType: r.mapping_type,
    sourceFields: r.source_fields || [], targetFields: r.target_fields || [], transformation: r.transformation, businessRule: r.business_rule,
    dataType: r.data_type, nullable: r.nullable, defaultValue: r.default_value, validation: r.validation,
    lookupTable: r.lookup_table, lookupKey: r.lookup_key, condition: r.condition, dependency: r.dependency,
    owner: r.owner, status: r.status, createdBy: r.created_by, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
  };
}

export interface CreateMappingSetInput { name: string; description?: string; sourceSystem: string; targetSystem: string; owner?: string }
export interface CreateFieldMappingInput {
  mappingType: MappingType; sourceFields: string[]; targetFields: string[]; transformation?: string; businessRule?: string;
  dataType?: string; nullable?: boolean; defaultValue?: string; validation?: string;
  lookupTable?: string; lookupKey?: string; condition?: string; dependency?: string; owner?: string;
}

const STATUS_TRANSITIONS: Record<MappingSetStatus, MappingSetStatus[]> = {
  draft: ['approved', 'deprecated'],
  approved: ['implemented', 'draft', 'deprecated'],
  implemented: ['validated', 'deprecated'],
  validated: ['deprecated'],
  deprecated: [],
};

export class MappingOwnershipError extends Error {
  constructor(message: string) { super(message); this.name = 'MappingOwnershipError'; }
}
export class InvalidMappingShapeError extends Error {
  constructor(message: string) { super(message); this.name = 'InvalidMappingShapeError'; }
}
export class InvalidMappingStatusTransitionError extends Error {
  constructor(from: MappingSetStatus, to: MappingSetStatus) {
    super(`Cannot move a mapping from "${from}" to "${to}". Allowed from "${from}": ${STATUS_TRANSITIONS[from].join(', ') || '(none — terminal state)'}.`);
    this.name = 'InvalidMappingStatusTransitionError';
  }
}

/** Real, enforced shape validation — the ONLY place mapping-type rules are checked, never silently accepted. */
function validateShape(input: CreateFieldMappingInput): void {
  const { mappingType, sourceFields, targetFields } = input;
  if (!sourceFields?.length) throw new InvalidMappingShapeError('At least one real source field is required.');
  if (!targetFields?.length) throw new InvalidMappingShapeError('At least one real target field is required.');
  if (mappingType === 'one_to_one' && (sourceFields.length !== 1 || targetFields.length !== 1)) {
    throw new InvalidMappingShapeError('one_to_one requires exactly 1 source field and 1 target field.');
  }
  if (mappingType === 'one_to_many' && (sourceFields.length !== 1 || targetFields.length < 2)) {
    throw new InvalidMappingShapeError('one_to_many requires exactly 1 source field and 2+ target fields.');
  }
  if (mappingType === 'many_to_one' && (sourceFields.length < 2 || targetFields.length !== 1)) {
    throw new InvalidMappingShapeError('many_to_one requires 2+ source fields and exactly 1 target field.');
  }
  if (mappingType === 'calculated' && !input.transformation?.trim()) {
    throw new InvalidMappingShapeError('calculated requires a real, non-empty transformation expression.');
  }
  if (mappingType === 'conditional' && !input.condition?.trim()) {
    throw new InvalidMappingShapeError('conditional requires a real, non-empty condition.');
  }
  if (mappingType === 'lookup' && (!input.lookupTable?.trim() || !input.lookupKey?.trim())) {
    throw new InvalidMappingShapeError('lookup requires a real lookup table and lookup key.');
  }
}

export class DataMappingEngine {
  private async getOwnedSet(id: string, clientId: string): Promise<SetRow> {
    const res = await sharedPool.query<SetRow>(`SELECT * FROM oc_data_mapping_sets WHERE id = $1`, [id]);
    const row = res.rows[0];
    if (!row) throw new MappingOwnershipError(`Mapping set ${id} not found.`);
    if (row.client_id !== clientId) throw new MappingOwnershipError('This mapping set does not belong to this client.');
    return row;
  }

  private async getOwnedField(id: string, clientId: string): Promise<FieldRow> {
    const res = await sharedPool.query<FieldRow>(`SELECT * FROM oc_data_field_mappings WHERE id = $1`, [id]);
    const row = res.rows[0];
    if (!row) throw new MappingOwnershipError(`Field mapping ${id} not found.`);
    if (row.client_id !== clientId) throw new MappingOwnershipError('This field mapping does not belong to this client.');
    return row;
  }

  async createMappingSet(clientId: string, input: CreateMappingSetInput, actor: string | null): Promise<MappingSet> {
    if (!input.name?.trim()) throw new Error('A real mapping set name is required.');
    if (!input.sourceSystem?.trim()) throw new Error('A real source system is required.');
    if (!input.targetSystem?.trim()) throw new Error('A real target system is required.');
    const res = await sharedPool.query<SetRow>(
      `INSERT INTO oc_data_mapping_sets (client_id, name, description, source_system, target_system, owner, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [clientId, input.name.trim(), input.description || '', input.sourceSystem.trim(), input.targetSystem.trim(), input.owner || null, actor],
    );
    return toSet(res.rows[0]!);
  }

  async listMappingSets(clientId: string): Promise<MappingSet[]> {
    const res = await sharedPool.query<SetRow>(`SELECT * FROM oc_data_mapping_sets WHERE client_id = $1 ORDER BY created_at DESC`, [clientId]);
    return res.rows.map(toSet);
  }

  async getMappingSet(id: string, clientId: string): Promise<MappingSet> {
    return toSet(await this.getOwnedSet(id, clientId));
  }

  async transitionSetStatus(id: string, clientId: string, to: MappingSetStatus, actor: string | null): Promise<MappingSet> {
    const row = await this.getOwnedSet(id, clientId);
    if (!STATUS_TRANSITIONS[row.status].includes(to)) throw new InvalidMappingStatusTransitionError(row.status, to);
    const res = await sharedPool.query<SetRow>(`UPDATE oc_data_mapping_sets SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, to]);
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence)
       VALUES ('data_mapping_set', $1, $2, $3, $4, $5, $6)`,
      [id, row.name, `mapping_set_${to}`, actor, JSON.stringify({ from: row.status, to }), [`Mapping set ${id} moved from "${row.status}" to "${to}".`]],
    );
    return toSet(res.rows[0]!);
  }

  async addFieldMapping(mappingSetId: string, clientId: string, input: CreateFieldMappingInput, actor: string | null): Promise<FieldMapping> {
    await this.getOwnedSet(mappingSetId, clientId);
    validateShape(input);
    const res = await sharedPool.query<FieldRow>(
      `INSERT INTO oc_data_field_mappings (mapping_set_id, client_id, mapping_type, source_fields, target_fields, transformation, business_rule, data_type, nullable, default_value, validation, lookup_table, lookup_key, condition, dependency, owner, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [mappingSetId, clientId, input.mappingType, input.sourceFields, input.targetFields, input.transformation || '', input.businessRule || '',
        input.dataType || null, input.nullable ?? true, input.defaultValue || null, input.validation || '',
        input.lookupTable || null, input.lookupKey || null, input.condition || null, input.dependency || '', input.owner || null, actor],
    );
    return toField(res.rows[0]!);
  }

  async listFieldMappings(mappingSetId: string, clientId: string): Promise<FieldMapping[]> {
    await this.getOwnedSet(mappingSetId, clientId);
    const res = await sharedPool.query<FieldRow>(`SELECT * FROM oc_data_field_mappings WHERE mapping_set_id = $1 ORDER BY created_at ASC`, [mappingSetId]);
    return res.rows.map(toField);
  }

  async getFieldMapping(id: string, clientId: string): Promise<FieldMapping> {
    return toField(await this.getOwnedField(id, clientId));
  }

  async updateFieldMapping(id: string, clientId: string, input: Partial<CreateFieldMappingInput>, actor: string | null): Promise<FieldMapping> {
    const row = await this.getOwnedField(id, clientId);
    const merged: CreateFieldMappingInput = {
      mappingType: input.mappingType || row.mapping_type, sourceFields: input.sourceFields || row.source_fields, targetFields: input.targetFields || row.target_fields,
      transformation: input.transformation ?? row.transformation, condition: input.condition ?? row.condition ?? undefined,
      lookupTable: input.lookupTable ?? row.lookup_table ?? undefined, lookupKey: input.lookupKey ?? row.lookup_key ?? undefined,
    };
    validateShape(merged);
    const res = await sharedPool.query<FieldRow>(
      `UPDATE oc_data_field_mappings SET
        mapping_type = $2, source_fields = $3, target_fields = $4, transformation = $5, business_rule = COALESCE($6, business_rule),
        data_type = COALESCE($7, data_type), nullable = COALESCE($8, nullable), default_value = COALESCE($9, default_value),
        validation = COALESCE($10, validation), lookup_table = $11, lookup_key = $12, condition = $13,
        dependency = COALESCE($14, dependency), owner = COALESCE($15, owner), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, merged.mappingType, merged.sourceFields, merged.targetFields, merged.transformation, input.businessRule,
        input.dataType, input.nullable, input.defaultValue, input.validation, merged.lookupTable || null, merged.lookupKey || null,
        merged.condition || null, input.dependency, input.owner],
    );
    const updated = res.rows[0]!;
    await sharedPool.query(
      `INSERT INTO oc_audit_log (entity_type, entity_id, entity_name, action, actor, details, evidence)
       VALUES ('data_field_mapping', $1, $2, 'updated', $3, $4, $5)`,
      [id, `${updated.source_fields.join(',')} -> ${updated.target_fields.join(',')}`, actor, JSON.stringify(input), [`Field mapping ${id} updated.`]],
    );
    return toField(updated);
  }

  async removeFieldMapping(id: string, clientId: string): Promise<void> {
    await this.getOwnedField(id, clientId);
    await sharedPool.query(`DELETE FROM oc_data_field_mappings WHERE id = $1`, [id]);
  }

  /** Real, non-fabricated completeness report — actual counts, never a synthetic percentage claim. */
  async getCompleteness(mappingSetId: string, clientId: string): Promise<{ total: number; withTransformationWhereRequired: number; missingDataType: number; missingValidation: number; byStatus: Record<MappingSetStatus, number> }> {
    const fields = await this.listFieldMappings(mappingSetId, clientId);
    const byStatus: Record<MappingSetStatus, number> = { draft: 0, approved: 0, implemented: 0, validated: 0, deprecated: 0 };
    let withTransformationWhereRequired = 0, missingDataType = 0, missingValidation = 0;
    for (const f of fields) {
      byStatus[f.status]++;
      const requiresTransform = f.mappingType === 'calculated' || f.mappingType === 'conditional';
      if (!requiresTransform || f.transformation.trim()) withTransformationWhereRequired++;
      if (!f.dataType) missingDataType++;
      if (!f.validation.trim()) missingValidation++;
    }
    return { total: fields.length, withTransformationWhereRequired, missingDataType, missingValidation, byStatus };
  }
}
