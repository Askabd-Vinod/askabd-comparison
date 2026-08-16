'use client';
import { useState, useEffect, useRef } from 'react';

interface Field { key: string; label: string; description?: string; fieldType: string; required: boolean; placeholder?: string; helpText?: string; options?: string[]; securityClassification?: string; validationRules?: string[] }
interface DocReq { key: string; name: string; description: string; required: boolean; acceptedTypes: string[]; maxSizeMb: number; expiryRequired: boolean }
interface Requirement { id: string; requirementKey: string; requirementName: string; description: string; whyRequired: string; fieldType: string; required: boolean; status: string; value: string; fieldsData: Record<string, string>; validationStatus: string; securityClassification: string; version: number; fields?: Field[]; documents?: DocReq[] }
interface DocRecord { id: string; document_name: string; status: string; version: number; uploaded_at: string; file_size: number; mime_type: string }

interface Props { clientId: string; serviceId: string; serviceName: string }

export function RequirementWorkspace({ clientId, serviceId, serviceName }: Props) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [expandedReq, setExpandedReq] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, Record<string, string>>>({});
  const [documents, setDocuments] = useState<Record<string, DocRecord[]>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [knownData, setKnownData] = useState<Record<string, { value: string; source: string; sourceLabel: string; status: string; confidence?: string; updatedAt?: string; conflict?: any }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ reqKey: string; docKey: string } | null>(null);
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

  useEffect(() => { loadAll(); loadKnownData(); }, [clientId, serviceId]);

  // Clear stale errors whenever requirements data updates and shows item as provided
  useEffect(() => {
    if (requirements.length > 0 && Object.keys(errors).length > 0) {
      const staleKeys = Object.keys(errors).filter(k => {
        const req = requirements.find(r => r.requirementKey === k);
        return req && (req.status === 'provided' || req.status === 'valid');
      });
      if (staleKeys.length > 0) {
        setErrors(prev => {
          const n = { ...prev };
          staleKeys.forEach(k => delete n[k]);
          return n;
        });
      }
    }
  }, [requirements]);

  async function loadKnownData() {
    try {
      const res = await fetch(`${API}/api/v1/oc/clients/${clientId}/known-information`);
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, any> = {};
        for (const f of (data.fields || [])) { map[f.key] = f; }
        setKnownData(map);
      }
    } catch { /* non-blocking — known data is enhancement only */ }
  }

  async function loadAll() {
    try {
      const res = await fetch(`${API}/api/v1/oc/client-services/${clientId}/${serviceId}/requirements`);
      if (!res.ok) {
        // Non-200 — retry once
        await new Promise(r => setTimeout(r, 2000));
        const retryRes = await fetch(`${API}/api/v1/oc/client-services/${clientId}/${serviceId}/requirements`);
        if (!retryRes.ok) return;
        const data = await retryRes.json();
        applyLoadedData(data);
        return;
      }
      const data = await res.json();
      applyLoadedData(data);
    } catch {
      // API unavailable on initial load — retry with increasing delay
      const delays = [2000, 4000, 8000];
      for (const delay of delays) {
        await new Promise(r => setTimeout(r, delay));
        try {
          const retryRes = await fetch(`${API}/api/v1/oc/client-services/${clientId}/${serviceId}/requirements`);
          if (retryRes.ok) {
            const data = await retryRes.json();
            applyLoadedData(data);
            return;
          }
        } catch { /* continue retrying */ }
      }
    }
  }

  function applyLoadedData(data: any) {
    setRequirements(data.requirements || []);
    setErrors({}); // Clear ALL stale errors on successful data load
    const vals: Record<string, Record<string, string>> = {};
    for (const req of (data.requirements || [])) {
      vals[req.requirementKey] = req.fieldsData || {};
      if (!req.fields && req.value) vals[req.requirementKey] = { _value: req.value };
    }
    setFieldValues(vals);
    for (const req of (data.requirements || [])) {
      if (req.documents?.length) { loadDocs(req.requirementKey); }
    }
  }

  async function loadDocs(reqKey: string) {
    try {
      const res = await fetch(`${API}/api/v1/oc/client-services/${clientId}/${serviceId}/requirements/${reqKey}/documents`);
      if (res.ok) { const d = await res.json(); setDocuments(prev => ({ ...prev, [reqKey]: d.documents || [] })); }
    } catch { /* skip */ }
  }

  function updateField(reqKey: string, fieldKey: string, value: string) {
    setFieldValues(prev => ({ ...prev, [reqKey]: { ...(prev[reqKey] || {}), [fieldKey]: value } }));
    setErrors(prev => { const n = { ...prev }; delete n[`${reqKey}.${fieldKey}`]; return n; });
  }

  function validateLocally(req: Requirement): string[] {
    const errs: string[] = [];
    const vals = fieldValues[req.requirementKey] || {};
    for (const f of (req.fields || [])) {
      const v = (vals[f.key] || '').trim();
      if (f.required && !v) { errs.push(`${f.label} is required`); continue; }
      if (!v) continue;
      for (const rule of (f.validationRules || [])) {
        if (rule === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errs.push(`${f.label}: invalid email`);
        if (rule === 'phone' && !/^[\d\s\+\-\(\)]{7,20}$/.test(v)) errs.push(`${f.label}: invalid phone`);
        if (rule === 'url') { try { const trimmed = v.trim(); if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) { errs.push(`${f.label}: URL must start with http:// or https://`); } else { new URL(trimmed); } } catch { errs.push(`${f.label}: invalid URL format`); } }
      }
    }
    return errs;
  }

  async function saveRequirement(reqKey: string) {
    const req = requirements.find(r => r.requirementKey === reqKey);
    if (!req) return;
    const localErrors = validateLocally(req);
    if (localErrors.length > 0) {
      const errMap: Record<string, string> = {};
      localErrors.forEach(e => errMap[`${reqKey}.${e.split(':')[0]}`] = e);
      setErrors(prev => ({ ...prev, ...errMap }));
      return;
    }
    setSaving(reqKey);
    setErrors({}); // Clear ALL errors when user initiates a new save
    const vals = fieldValues[reqKey] || {};
    const body = req.fields ? { value: '', actor: 'admin', fieldsData: vals } : { value: vals._value || '', actor: 'admin' };
    const preVersion = req.version || 0;

    try {
      const res = await fetch(`${API}/api/v1/oc/client-services/${clientId}/${serviceId}/requirements/${reqKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setRequirements(prev => {
          const updated = prev.map(r => r.requirementKey === reqKey ? { ...r, ...data, fieldsData: data.fieldsData || vals } : r);
          // Auto-advance to next incomplete requirement
          const nextIncomplete = updated.find(r => r.requirementKey !== reqKey && r.required && r.status !== 'provided' && r.status !== 'valid');
          if (nextIncomplete) {
            setExpandedReq(nextIncomplete.requirementKey);
          } else {
            setExpandedReq(null); // All done — collapse
          }
          return updated;
        });
        setErrors(prev => { const n = { ...prev }; delete n[reqKey]; return n; });
        // Re-fetch full state to update readiness/blockers (non-blocking — save already succeeded)
        loadAll().catch(() => {});
        setSaving(null);
        return;
      } else {
        const d = await res.json().catch(() => null);
        if (res.status === 404) {
          // Requirement not initialized yet — trigger initialization via GET then retry save
          try {
            await loadAll(); // This GET initializes records in DB
            const retryRes = await fetch(`${API}/api/v1/oc/client-services/${clientId}/${serviceId}/requirements/${reqKey}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            if (retryRes.ok) {
              const retryData = await retryRes.json();
              setRequirements(prev => {
                const updated = prev.map(r => r.requirementKey === reqKey ? { ...r, ...retryData, fieldsData: retryData.fieldsData || vals } : r);
                const nextIncomplete = updated.find(r => r.requirementKey !== reqKey && r.required && r.status !== 'provided' && r.status !== 'valid');
                setExpandedReq(nextIncomplete ? nextIncomplete.requirementKey : null);
                return updated;
              });
              setErrors(prev => { const n = { ...prev }; delete n[reqKey]; return n; });
              loadAll().catch(() => {});
              setSaving(null);
              return;
            }
          } catch { /* retry failed */ }
          setErrors(prev => ({ ...prev, [reqKey]: 'Please try saving again.' }));
        } else if (res.status === 400 || res.status === 422) {
          setErrors(prev => ({ ...prev, [reqKey]: d?.error || 'Please check the form fields and try again.' }));
        } else {
          setErrors(prev => ({ ...prev, [reqKey]: d?.error?.message || d?.error || `Server error (${res.status}). Please try again.` }));
        }
      }
    } catch (err: any) {
      // Network failure — retry once silently before showing error
      try {
        await new Promise(r => setTimeout(r, 1500));
        const retryRes = await fetch(`${API}/api/v1/oc/client-services/${clientId}/${serviceId}/requirements/${reqKey}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          setRequirements(prev => {
            const updated = prev.map(r => r.requirementKey === reqKey ? { ...r, ...retryData, fieldsData: retryData.fieldsData || vals } : r);
            const nextIncomplete = updated.find(r => r.requirementKey !== reqKey && r.required && r.status !== 'provided' && r.status !== 'valid');
            setExpandedReq(nextIncomplete ? nextIncomplete.requirementKey : null);
            return updated;
          });
          setErrors(prev => { const n = { ...prev }; delete n[reqKey]; return n; });
          loadAll().catch(() => {});
          setSaving(null);
          return;
        }
      } catch { /* retry also failed — try reconciliation */ }

      // On retry failure, verify if the save actually succeeded (timeout reconciliation)
      try {
        const verifyRes = await fetch(`${API}/api/v1/oc/client-services/${clientId}/${serviceId}/requirements`);
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          const savedReq = (verifyData.requirements || []).find((r: any) => r.requirementKey === reqKey);
          if (savedReq && (savedReq.version || 0) > preVersion) {
            // Save DID succeed — backend committed before we lost the response
            setRequirements(verifyData.requirements || []);
            setErrors(prev => { const n = { ...prev }; delete n[reqKey]; return n; });
            setSaving(null);
            return; // Success — no error to show
          }
        }
      } catch { /* verification also failed */ }

      setErrors(prev => ({ ...prev, [reqKey]: 'Save failed. Please try again.' }));
    }
    setSaving(null);
  }

  async function uploadDocument(reqKey: string, docKey: string, file: File) {
    setUploading(`${reqKey}.${docKey}`);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API}/api/v1/oc/client-services/${clientId}/${serviceId}/requirements/${reqKey}/documents`, { method: 'POST', body: formData });
      if (res.ok) { await loadDocs(reqKey); }
      else { const d = await res.json().catch(() => null); setErrors(prev => ({ ...prev, [`${reqKey}.${docKey}`]: d?.error || 'Upload failed' })); }
    } catch { setErrors(prev => ({ ...prev, [`${reqKey}.${docKey}`]: 'Upload failed' })); }
    setUploading(null);
    setUploadTarget(null);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && uploadTarget) { uploadDocument(uploadTarget.reqKey, uploadTarget.docKey, file); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // Calculate blockers
  const blockers: { type: string; reqKey: string; label: string; message: string }[] = [];
  for (const req of requirements) {
    if (!req.required) continue;
    if (req.fields) {
      const vals = fieldValues[req.requirementKey] || {};
      for (const f of req.fields) {
        if (f.required && !(vals[f.key] || '').trim()) {
          blockers.push({ type: 'field', reqKey: req.requirementKey, label: `${req.requirementName} → ${f.label}`, message: 'Required field missing' });
        }
      }
    } else if (req.status === 'not_provided' || req.status === 'invalid') {
      blockers.push({ type: 'field', reqKey: req.requirementKey, label: req.requirementName, message: 'Required information missing' });
    }
    if (req.documents) {
      for (const doc of req.documents) {
        if (!doc.required) continue;
        const uploaded = (documents[req.requirementKey] || []).find(d => d.status !== 'superseded');
        if (!uploaded) blockers.push({ type: 'document', reqKey: req.requirementKey, label: doc.name, message: 'Required document missing' });
      }
    }
  }
  const provided = requirements.filter(r => r.status === 'provided' || r.status === 'valid');
  const nextBlocker = blockers[0];

  if (requirements.length === 0) return null;

  const knownCount = Object.keys(knownData).length;

  return (
    <div className="bg-white rounded-xl border p-5 mt-4">
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[9px] text-gray-500 uppercase font-semibold tracking-wide">Client Requirements</p>
          <p className="text-xs text-gray-700 mt-0.5">{serviceName}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-purple-600">{provided.length}/{requirements.length}</p>
          <p className="text-[9px] text-gray-400">complete</p>
        </div>
      </div>

      {/* ASK ONCE indicator */}
      {knownCount > 0 && (
        <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-emerald-600 text-sm">✓</span>
            <span className="text-[10px] font-medium text-emerald-800">ASK ONCE — {knownCount} field{knownCount > 1 ? 's' : ''} already known</span>
          </div>
          <div className="flex gap-3 mt-1 ml-5 text-[9px]">
            {Object.values(knownData).filter(f => f.status === 'already_known' || f.status === 'verified').length > 0 && <span className="text-emerald-600">✓ {Object.values(knownData).filter(f => f.status === 'already_known' || f.status === 'verified').length} verified</span>}
            {Object.values(knownData).filter(f => f.status === 'discovered').length > 0 && <span className="text-blue-600">ℹ {Object.values(knownData).filter(f => f.status === 'discovered').length} discovered</span>}
            {Object.values(knownData).filter(f => f.status === 'conflicting').length > 0 && <span className="text-amber-600">⚠ {Object.values(knownData).filter(f => f.status === 'conflicting').length} conflict{Object.values(knownData).filter(f => f.status === 'conflicting').length > 1 ? 's' : ''}</span>}
          </div>
          <p className="text-[9px] text-emerald-600 mt-1 ml-5">AskABD reuses previously collected information. Confirm or edit below.</p>
        </div>
      )}

      {/* Progress */}
      <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-purple-500 to-green-500 rounded-full transition-all" style={{ width: `${requirements.length > 0 ? (provided.length / requirements.length) * 100 : 0}%` }} />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div className="bg-green-50 rounded p-1.5"><p className="text-xs font-bold text-green-600">{provided.length}</p><p className="text-[8px] text-green-500">Complete</p></div>
        <div className="bg-amber-50 rounded p-1.5"><p className="text-xs font-bold text-amber-600">{requirements.length - provided.length}</p><p className="text-[8px] text-amber-500">Remaining</p></div>
        <div className="bg-red-50 rounded p-1.5"><p className="text-xs font-bold text-red-600">{blockers.length}</p><p className="text-[8px] text-red-500">Blockers</p></div>
      </div>

      {/* Requirement Cards */}
      <div className="space-y-2">
        {requirements.map(req => {
          const isComplete = req.status === 'provided' || req.status === 'valid';
          const isExpanded = expandedReq === req.requirementKey;
          const vals = fieldValues[req.requirementKey] || {};
          const reqDocs = documents[req.requirementKey] || [];
          const hasFields = req.fields && req.fields.length > 0;
          const hasDocs = req.documents && req.documents.length > 0;
          const fieldCount = req.fields?.length || (req.fieldType ? 1 : 0);
          const filledCount = hasFields ? req.fields!.filter(f => (vals[f.key] || '').trim()).length : (vals._value ? 1 : 0);

          return (
            <div key={req.requirementKey} className={`rounded-lg border transition-all ${isComplete ? 'border-green-200 bg-green-50/20' : req.required ? 'border-amber-200' : 'border-gray-200'}`}>
              {/* Collapsed header */}
              <button onClick={() => setExpandedReq(isExpanded ? null : req.requirementKey)} className="w-full flex items-center gap-2 p-3 text-left hover:bg-gray-50/50 transition">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${isComplete ? 'bg-green-500 text-white' : req.status === 'in_progress' ? 'bg-amber-400 text-white' : req.required ? 'bg-red-400 text-white' : 'bg-gray-300 text-white'}`}>
                  {isComplete ? '✓' : filledCount > 0 ? `${filledCount}` : '!'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-gray-800 truncate">{req.requirementName}</p>
                    {req.required && <span className="text-[7px] font-bold text-red-500 bg-red-50 px-1 rounded">REQ</span>}
                    {req.securityClassification === 'secret' && <span className="text-[8px]">🔒</span>}
                  </div>
                  <p className="text-[9px] text-gray-500 truncate">{hasFields ? `${filledCount}/${fieldCount} fields` : req.status}{hasDocs ? ` • ${reqDocs.length} doc${reqDocs.length !== 1 ? 's' : ''}` : ''}</p>
                </div>
                <span className="text-gray-400 text-[10px] shrink-0">{isExpanded ? '▲' : '▼'}</span>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-gray-100 pt-3">
                  {/* Why required */}
                  {req.whyRequired && (
                    <div className="bg-purple-50 border border-purple-100 rounded p-2 mb-3">
                      <p className="text-[9px] text-purple-600 font-medium">Why AskABD needs this:</p>
                      <p className="text-[10px] text-purple-700 mt-0.5">{req.whyRequired}</p>
                    </div>
                  )}

                  {/* Multi-field form */}
                  {hasFields && (
                    <div className="space-y-2.5 mb-3">
                      {req.fields!.map(field => {
                        const known = knownData[field.key] || knownData[req.requirementKey];
                        const isKnown = known && known.value && !vals[field.key];
                        return (
                        <div key={field.key}>
                          <label className="text-[10px] font-medium text-gray-700">
                            {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
                          </label>
                          {field.helpText && <p className="text-[8px] text-gray-400">{field.helpText}</p>}
                          {isKnown ? (
                            <div className={`mt-1 p-2 rounded-md border ${known.status === 'conflicting' ? 'bg-amber-50 border-amber-300' : known.status === 'discovered' ? 'bg-blue-50 border-blue-200' : known.status === 'verified' ? 'bg-green-50 border-green-300' : 'bg-emerald-50 border-emerald-200'}`}>
                              <div className="text-xs font-medium text-gray-800">{known.value}</div>
                              <div className="text-[9px] mt-0.5" style={{ color: known.status === 'conflicting' ? '#92400e' : known.status === 'discovered' ? '#1e40af' : '#065f46' }}>
                                {known.status === 'conflicting' ? '⚠ Information conflict' : known.status === 'discovered' ? 'ℹ Discovered by AskABD' : known.status === 'verified' ? '✓ Verified' : '✓ Already known'} — {known.sourceLabel}
                                {known.confidence && <span className="ml-1 opacity-70">({known.confidence})</span>}
                                {known.updatedAt && <span className="ml-1 opacity-60">{new Date(known.updatedAt).toLocaleDateString()}</span>}
                              </div>
                              {known.status === 'conflicting' && known.conflict && (
                                <div className="mt-1 text-[9px] text-amber-700">
                                  Other value: <strong>{known.conflict.otherValue}</strong> from {known.conflict.otherSource}
                                </div>
                              )}
                              <div className="flex gap-2 mt-1.5">
                                {known.status === 'conflicting' ? (
                                  <>
                                    <button type="button" onClick={() => { updateField(req.requirementKey, field.key, known.value); }} className="text-[9px] px-2 py-0.5 bg-emerald-600 text-white rounded hover:bg-emerald-700">Keep Current</button>
                                    {known.conflict && <button type="button" onClick={() => { updateField(req.requirementKey, field.key, known.conflict.otherValue); }} className="text-[9px] px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700">Use Other</button>}
                                    <button type="button" onClick={() => { setFieldValues(prev => ({ ...prev, [req.requirementKey]: { ...prev[req.requirementKey], [field.key]: '' } })); }} className="text-[9px] px-2 py-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Edit</button>
                                  </>
                                ) : known.status === 'discovered' ? (
                                  <button type="button" onClick={() => { updateField(req.requirementKey, field.key, known.value); }} className="text-[9px] px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700">Accept</button>
                                ) : (
                                  <>
                                    <button type="button" onClick={() => { updateField(req.requirementKey, field.key, known.value); }} className="text-[9px] px-2 py-0.5 bg-emerald-600 text-white rounded hover:bg-emerald-700">Confirm</button>
                                    <button type="button" onClick={() => { setFieldValues(prev => ({ ...prev, [req.requirementKey]: { ...prev[req.requirementKey], [field.key]: '' } })); }} className="text-[9px] px-2 py-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Edit</button>
                                  </>
                                )}
                              </div>
                            </div>
                          ) : renderField(field, vals[field.key] || '', v => updateField(req.requirementKey, field.key, v))}
                          {errors[`${req.requirementKey}.${field.label}`] && <p className="text-[8px] text-red-500 mt-0.5">{errors[`${req.requirementKey}.${field.label}`]}</p>}
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Single field (legacy) */}
                  {!hasFields && req.fieldType && (
                    <div className="mb-3">
                      {renderField({ key: '_value', label: req.requirementName, fieldType: req.fieldType, required: req.required, placeholder: req.description, options: undefined, securityClassification: req.securityClassification } as Field, vals._value || '', v => updateField(req.requirementKey, '_value', v))}
                    </div>
                  )}

                  {/* Save button */}
                  <button onClick={() => saveRequirement(req.requirementKey)} disabled={saving === req.requirementKey} className="text-[10px] font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded transition">
                    {saving === req.requirementKey ? 'Saving...' : 'Save Information'}
                  </button>
                  {errors[req.requirementKey] && <p className="text-[9px] text-red-500 mt-1">{errors[req.requirementKey]}</p>}

                  {/* Document requirements */}
                  {hasDocs && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-[9px] font-semibold text-gray-600 uppercase mb-2">Required Documents</p>
                      {req.documents!.map(docReq => {
                        const uploaded = reqDocs.filter(d => d.status !== 'superseded');
                        const latestDoc = uploaded[0];
                        const isUploading = uploading === `${req.requirementKey}.${docReq.key}`;
                        return (
                          <div key={docReq.key} className={`rounded border p-2 mb-2 ${latestDoc ? 'border-green-200 bg-green-50/30' : docReq.required ? 'border-amber-200 bg-amber-50/20' : 'border-gray-200'}`}>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-[10px] font-medium text-gray-800">{docReq.name}{docReq.required && <span className="text-red-500 ml-0.5">*</span>}</p>
                                <p className="text-[8px] text-gray-500">{docReq.acceptedTypes.map(t => t.split('/')[1]?.toUpperCase()).join(', ')} • Max {docReq.maxSizeMb}MB{docReq.expiryRequired ? ' • Expiry required' : ''}</p>
                              </div>
                              {latestDoc ? (
                                <span className="text-[8px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded">v{latestDoc.version} ✓</span>
                              ) : (
                                <button onClick={() => { setUploadTarget({ reqKey: req.requirementKey, docKey: docReq.key }); fileInputRef.current?.click(); }} disabled={isUploading} className="text-[9px] font-medium bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded transition disabled:bg-gray-300">
                                  {isUploading ? 'Uploading...' : 'Upload'}
                                </button>
                              )}
                            </div>
                            {latestDoc && (
                              <div className="mt-1.5 flex items-center gap-2 text-[8px] text-gray-500">
                                <span>📄 {latestDoc.document_name}</span>
                                <span>{Math.round(latestDoc.file_size / 1024)}KB</span>
                                <button onClick={() => { setUploadTarget({ reqKey: req.requirementKey, docKey: docReq.key }); fileInputRef.current?.click(); }} className="text-purple-600 hover:text-purple-800 font-medium ml-auto">Replace</button>
                              </div>
                            )}
                            {errors[`${req.requirementKey}.${docReq.key}`] && <p className="text-[8px] text-red-500 mt-1">{errors[`${req.requirementKey}.${docReq.key}`]}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Next Action */}
      {nextBlocker && (
        <div className="mt-4 pt-3 border-t">
          <p className="text-[9px] text-gray-500 uppercase font-semibold mb-1">Next Action</p>
          <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg p-3">
            <div>
              <p className="text-xs font-semibold text-purple-800">{nextBlocker.label}</p>
              <p className="text-[10px] text-purple-600">{nextBlocker.message}</p>
            </div>
            <button onClick={() => setExpandedReq(nextBlocker.reqKey)} className="text-[10px] font-semibold bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded transition shrink-0">
              {nextBlocker.type === 'document' ? 'Upload →' : 'Provide →'}
            </button>
          </div>
        </div>
      )}

      {/* All complete */}
      {blockers.length === 0 && requirements.length > 0 && (
        <div className="mt-4 pt-3 border-t">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <p className="text-xs font-semibold text-green-800">✓ All requirements satisfied</p>
            <p className="text-[10px] text-green-600 mt-0.5">Ready for service validation</p>
          </div>
        </div>
      )}
    </div>
  );
}

function renderField(field: Field, value: string, onChange: (v: string) => void) {
  const base = "w-full border rounded px-2 py-1.5 text-[11px] focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition";
  switch (field.fieldType) {
    case 'textarea': return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} className={`${base} min-h-[60px]`} />;
    case 'select': return (
      <select value={value} onChange={e => onChange(e.target.value)} className={`${base} bg-white`}>
        <option value="">Select...</option>
        {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
    case 'checkbox': return (
      <label className="flex items-center gap-2 text-[11px] mt-1"><input type="checkbox" checked={value === 'true'} onChange={e => onChange(e.target.checked ? 'true' : 'false')} className="rounded border-gray-300" /> Confirmed</label>
    );
    case 'secret': return <input type="password" value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || '••••••••'} className={base} />;
    case 'date': return <input type="date" value={value} onChange={e => onChange(e.target.value)} className={base} />;
    case 'number': return <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} className={base} />;
    default: return <input type={field.fieldType === 'email' ? 'email' : field.fieldType === 'url' ? 'url' : field.fieldType === 'phone' ? 'tel' : 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} className={base} />;
  }
}
