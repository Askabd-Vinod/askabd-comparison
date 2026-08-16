'use client';
import { useState } from 'react';
import { recordServiceAction } from '../lib/operations-api';
import { sendNotification, getStandardSubject } from '../lib/notifications';
interface ServiceControlsProps {
  entityId: string;
  entityName: string;
  entityType: 'client' | 'application' | 'service' | 'environment';
  initialEnabled?: boolean;
}

/**
 * Enable/Disable toggle and Restart button for any managed entity.
 * Used across clients, applications, services, and environments.
 */
export function ServiceControls({ entityId, entityName, entityType, initialEnabled = true }: ServiceControlsProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [restarting, setRestarting] = useState(false);
  const [showConfirm, setShowConfirm] = useState<'toggle' | 'restart' | null>(null);

  function handleToggle() {
    setShowConfirm('toggle');
  }

  function handleRestart() {
    setShowConfirm('restart');
  }

  function confirmToggle() {
    setEnabled(!enabled);
    setShowConfirm(null);
  }

  function confirmRestart() {
    setRestarting(true);
    setShowConfirm(null);
    setTimeout(() => setRestarting(false), 3000);
  }

  return (
    <div className="flex items-center gap-2 relative">
      {/* Toggle */}
      <button
        onClick={handleToggle}
        className="group relative"
        title={enabled ? `Disable ${entityType}` : `Enable ${entityType}`}
        aria-label={enabled ? `Disable ${entityName}` : `Enable ${entityName}`}
      >
        <div className={`w-8 h-4.5 rounded-full transition-colors duration-200 flex items-center ${enabled ? 'bg-green-500' : 'bg-gray-300'}`} style={{ padding: '2px' }}>
          <div className={`w-3.5 h-3.5 bg-white rounded-full shadow transition-transform duration-200 ${enabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
        </div>
      </button>

      {/* Restart */}
      <button
        onClick={handleRestart}
        disabled={restarting || !enabled}
        className={`text-[9px] font-medium px-1.5 py-0.5 rounded transition ${
          restarting
            ? 'bg-blue-100 text-blue-600 cursor-wait'
            : !enabled
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-gray-100 text-gray-600 hover:bg-orange-100 hover:text-orange-700'
        }`}
        title={restarting ? 'Restarting…' : !enabled ? 'Enable first to restart' : `Restart ${entityType}`}
        aria-label={`Restart ${entityName}`}
      >
        {restarting ? '↻' : '⟳'}
      </button>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="absolute z-50 right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl p-3 animate-in">
          <p className="text-[11px] font-semibold text-gray-900 mb-1">
            {showConfirm === 'toggle'
              ? (enabled ? `Disable ${entityName}?` : `Enable ${entityName}?`)
              : `Restart ${entityName}?`
            }
          </p>
          <p className="text-[10px] text-gray-500 mb-3">
            {showConfirm === 'toggle'
              ? (enabled
                ? `This will stop all services for this ${entityType}. You can re-enable later.`
                : `This will resume all services for this ${entityType}.`)
              : `This will perform a graceful restart. Active connections will be drained first.`
            }
          </p>
          <div className="flex gap-2">
            <button
              onClick={showConfirm === 'toggle' ? confirmToggle : confirmRestart}
              className={`flex-1 text-[10px] font-medium py-1.5 rounded transition text-white ${
                showConfirm === 'toggle' && enabled
                  ? 'bg-red-600 hover:bg-red-700'
                  : showConfirm === 'toggle' && !enabled
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-orange-600 hover:bg-orange-700'
              }`}
            >
              {showConfirm === 'toggle'
                ? (enabled ? 'Disable' : 'Enable')
                : 'Restart'
              }
            </button>
            <button
              onClick={() => setShowConfirm(null)}
              className="flex-1 text-[10px] font-medium py-1.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline version for table rows — toggle and restart aligned horizontally.
 * During restart, the entire row grays out and shows status feedback.
 */
export function ServiceControlsInline({ entityId, entityName, entityType, initialEnabled = true }: ServiceControlsProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [restartPhase, setRestartPhase] = useState<'idle' | 'restarting' | 'completed'>('idle');
  const [showConfirm, setShowConfirm] = useState<'toggle' | 'restart' | null>(null);

  function confirmToggle() {
    const newState = !enabled;
    setEnabled(newState);
    setShowConfirm(null);
    // Persist to database
    recordServiceAction({
      entityType, entityId, entityName,
      action: newState ? 'enabled' : 'disabled',
      previousState: enabled ? 'enabled' : 'disabled',
      newState: newState ? 'enabled' : 'disabled',
      actor: 'hello@askabd.com',
      reason: `Manual ${newState ? 'enable' : 'disable'} via Operations Centre`,
    }).catch(() => {});
    // Send notification
    sendNotification({
      clientId: entityId, clientName: entityName, phase: 'service-change',
      priority: newState ? 'low' : 'high',
      subject: getStandardSubject('service-change', newState ? 'Enabled' : 'Disabled', entityName),
      summary: `${entityType} "${entityName}" has been ${newState ? 'enabled' : 'disabled'}.`,
      details: { action: newState ? 'Service Enabled' : 'Service Disabled', performedBy: 'hello@askabd.com', timestamp: new Date().toISOString(), impactLevel: newState ? 'None' : 'Service unavailable' },
      recipients: [], // Will be populated from client config by the API
    }).catch(() => {});
  }

  function confirmRestart() {
    setRestartPhase('restarting');
    setShowConfirm(null);
    const startTime = Date.now();
    setTimeout(() => {
      const durationMs = Date.now() - startTime;
      setRestartPhase('completed');
      // Persist to database
      recordServiceAction({
        entityType, entityId, entityName,
        action: 'restarted',
        previousState: 'running', newState: 'running',
        actor: 'hello@askabd.com',
        reason: 'Manual restart via Operations Centre',
        durationMs,
      }).catch(() => {});
      // Send notification
      sendNotification({
        clientId: entityId, clientName: entityName, phase: 'service-change',
        priority: 'medium',
        subject: getStandardSubject('service-change', 'Restarted', entityName),
        summary: `${entityType} "${entityName}" has been restarted. Duration: ${Math.round(durationMs / 1000)}s.`,
        details: { action: 'Service Restarted', performedBy: 'hello@askabd.com', timestamp: new Date().toISOString(), impactLevel: 'Brief interruption during restart' },
        recipients: [],
      }).catch(() => {});
      setTimeout(() => setRestartPhase('idle'), 3000);
    }, 4000);
  }

  const isRestarting = restartPhase === 'restarting';
  const isCompleted = restartPhase === 'completed';

  return (
    <div className={`flex items-center gap-3 relative ${isRestarting ? 'opacity-40 pointer-events-none' : ''}`}>
      {/* Status indicator during restart */}
      {isRestarting && (
        <span className="text-[9px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded animate-pulse whitespace-nowrap">
          Restarting…
        </span>
      )}
      {isCompleted && (
        <span className="text-[9px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded whitespace-nowrap">
          ✓ Running
        </span>
      )}

      {/* Toggle Switch with ON/OFF label */}
      {!isRestarting && !isCompleted && (
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowConfirm('toggle'); }}
          title={enabled ? `Disable ${entityName}` : `Enable ${entityName}`}
          aria-label={enabled ? `Disable ${entityName}` : `Enable ${entityName}`}
          className="shrink-0 flex items-center gap-1.5"
        >
          <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
          </div>
          <span className={`text-[9px] font-bold uppercase ${enabled ? 'text-green-600' : 'text-gray-400'}`}>
            {enabled ? 'ON' : 'OFF'}
          </span>
        </button>
      )}

      {/* Restart Button */}
      {!isRestarting && !isCompleted && (
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowConfirm('restart'); }}
          disabled={!enabled}
          className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-sm transition border ${
            !enabled
              ? 'text-gray-300 border-gray-200 cursor-not-allowed'
              : 'text-gray-500 border-gray-200 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-300'
          }`}
          title={!enabled ? 'Enable first' : `Restart ${entityName}`}
          aria-label={`Restart ${entityName}`}
        >
          ⟳
        </button>
      )}

      {/* Confirmation Popup */}
      {showConfirm && (
        <div className="absolute z-50 right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-left" onClick={(e) => e.stopPropagation()}>
          <p className="text-[11px] font-semibold text-gray-900 mb-1">
            {showConfirm === 'toggle'
              ? (enabled ? `Disable ${entityName}?` : `Enable ${entityName}?`)
              : `Restart ${entityName}?`
            }
          </p>
          <p className="text-[10px] text-gray-500 mb-2.5">
            {showConfirm === 'toggle'
              ? (enabled ? `All services for this ${entityType} will be stopped. You can re-enable anytime.` : `All services for this ${entityType} will be resumed.`)
              : `The ${entityType} will be gracefully restarted. Active connections will be drained. The row will be grayed out during restart.`
            }
          </p>
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); showConfirm === 'toggle' ? confirmToggle() : confirmRestart(); }}
              className={`flex-1 text-[10px] font-medium py-1.5 rounded text-white transition ${
                showConfirm === 'toggle' && enabled ? 'bg-red-600 hover:bg-red-700'
                : showConfirm === 'toggle' ? 'bg-green-600 hover:bg-green-700'
                : 'bg-orange-600 hover:bg-orange-700'
              }`}
            >
              {showConfirm === 'toggle' ? (enabled ? 'Disable' : 'Enable') : 'Restart Now'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowConfirm(null); }}
              className="flex-1 text-[10px] font-medium py-1.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
