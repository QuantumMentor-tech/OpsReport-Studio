/**
 * OpsReport Studio — Station Management & Configuration Editor
 *
 * Implements the authoritative station configuration interface:
 * - Viewing stations in strictly persisted operational sequence (non-alphabetical)
 * - Adding stations with validated name, optional code, and active status
 * - Editing station properties without changing stable identifiers
 * - Atomic move-up and move-down operational reordering
 * - Contiguous 1..N ordinal sequence maintenance on reorder and delete
 * - Safe deletion confirmation preventing unintended loss
 * - Full Dark & Light theme compatibility with WCAG AA contrast
 *
 * @module renderer/views/StationsView
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { StationRecord, CreateStationInput, UpdateStationInput } from '../../shared/types.ts';
import { PageHeader } from '../components/common/PageHeader.tsx';
import { Card } from '../components/common/Card.tsx';
import { Button } from '../components/common/Button.tsx';
import { Badge } from '../components/common/Badge.tsx';
import { EmptyState } from '../components/common/EmptyState.tsx';
import { getStationClient } from '../services/station-client.ts';

export interface StationsViewProps {
  /** Optional pre-loaded stations (useful for tests and SSR) */
  initialStations?: StationRecord[];
}

export const StationsView: React.FC<StationsViewProps> = ({ initialStations }) => {
  const [stations, setStations] = useState<StationRecord[]>(initialStations ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(initialStations === undefined);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter & Search states
  const [activeOnly, setActiveOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal dialog states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingStation, setEditingStation] = useState<StationRecord | null>(null);

  // Form field states
  const [formName, setFormName] = useState<string>('');
  const [formCode, setFormCode] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [stationToDelete, setStationToDelete] = useState<StationRecord | null>(null);

  const client = useMemo(() => getStationClient(), []);

  // Fetch stations from persistence
  const loadStations = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await client.getAll({ activeOnly });
      if (result.ok) {
        setStations(result.value);
      } else {
        setErrorMessage(result.error.userMessage || 'Failed to load station list from database.');
      }
    } catch (err) {
      setErrorMessage(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [client, activeOnly]);

  useEffect(() => {
    if (initialStations === undefined) {
      loadStations();
    }
  }, [loadStations, initialStations]);

  // Filtered station list for display (e.g. search)
  const displayStations = useMemo(() => {
    let list = stations;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        s =>
          s.station_name.toLowerCase().includes(q) ||
          (s.station_code && s.station_code.toLowerCase().includes(q))
      );
    }
    return list;
  }, [stations, searchQuery]);

  // Summary counts
  const totalCount = stations.length;
  const activeCount = stations.filter(s => s.is_active === 1).length;
  const inactiveCount = totalCount - activeCount;

  // Open modal in Add mode
  const handleOpenAdd = () => {
    setModalMode('add');
    setEditingStation(null);
    setFormName('');
    setFormCode('');
    setFormIsActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open modal in Edit mode
  const handleOpenEdit = (station: StationRecord) => {
    setModalMode('edit');
    setEditingStation(station);
    setFormName(station.station_name);
    setFormCode(station.station_code || '');
    setFormIsActive(station.is_active === 1);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Submit Add or Edit Form
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError('Station name is required.');
      return;
    }
    if (trimmedName.length > 150) {
      setFormError('Station name must be 150 characters or fewer.');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      if (modalMode === 'add') {
        const input: CreateStationInput = {
          stationName: trimmedName,
          stationCode: formCode.trim() || null,
          isActive: formIsActive,
        };
        const result = await client.create(input);
        if (!result.ok) {
          setFormError(result.error.userMessage || 'Failed to create station.');
          setIsSaving(false);
          return;
        }
        setSuccessMessage(`Station "${trimmedName}" created successfully.`);
      } else if (editingStation) {
        const input: UpdateStationInput = {
          stationName: trimmedName,
          stationCode: formCode.trim() || null,
          isActive: formIsActive,
        };
        const result = await client.update(editingStation.station_id, input);
        if (!result.ok) {
          setFormError(result.error.userMessage || 'Failed to update station.');
          setIsSaving(false);
          return;
        }
        setSuccessMessage(`Station "${trimmedName}" updated successfully.`);
      }

      setIsModalOpen(false);
      await loadStations();
    } catch (err) {
      setFormError(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Move Station Up in Operational Sequence
  const handleMoveUp = async (index: number) => {
    if (index <= 0 || isSaving) return;
    const currentList = [...stations];
    const prevIndex = index - 1;

    // Swap adjacent stations
    const temp = currentList[index];
    currentList[index] = currentList[prevIndex];
    currentList[prevIndex] = temp;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const orderedIds = currentList.map(s => s.station_id);
      const result = await client.reorder(orderedIds);
      if (result.ok) {
        setStations(result.value);
        setSuccessMessage(`Reordered "${temp.station_name}" up to position #${prevIndex + 1}.`);
      } else {
        setErrorMessage(result.error.userMessage || 'Failed to persist station reordering.');
        await loadStations(); // revert UI to persisted state
      }
    } catch (err) {
      setErrorMessage(`Reorder failed: ${err instanceof Error ? err.message : String(err)}`);
      await loadStations();
    } finally {
      setIsSaving(false);
    }
  };

  // Move Station Down in Operational Sequence
  const handleMoveDown = async (index: number) => {
    if (index >= stations.length - 1 || isSaving) return;
    const currentList = [...stations];
    const nextIndex = index + 1;

    // Swap adjacent stations
    const temp = currentList[index];
    currentList[index] = currentList[nextIndex];
    currentList[nextIndex] = temp;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const orderedIds = currentList.map(s => s.station_id);
      const result = await client.reorder(orderedIds);
      if (result.ok) {
        setStations(result.value);
        setSuccessMessage(`Reordered "${temp.station_name}" down to position #${nextIndex + 1}.`);
      } else {
        setErrorMessage(result.error.userMessage || 'Failed to persist station reordering.');
        await loadStations();
      }
    } catch (err) {
      setErrorMessage(`Reorder failed: ${err instanceof Error ? err.message : String(err)}`);
      await loadStations();
    } finally {
      setIsSaving(false);
    }
  };

  // Quick Toggle Active Status
  const handleToggleActive = async (station: StationRecord) => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const newStatus = station.is_active !== 1;
      const result = await client.update(station.station_id, { isActive: newStatus });
      if (result.ok) {
        setSuccessMessage(
          `Station "${station.station_name}" is now ${newStatus ? 'active' : 'decommissioned'}.`
        );
        await loadStations();
      } else {
        setErrorMessage(result.error.userMessage || 'Failed to toggle station status.');
      }
    } catch (err) {
      setErrorMessage(`Status update failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Open Delete Confirmation
  const handleOpenDelete = (station: StationRecord) => {
    setStationToDelete(station);
    setIsDeleteModalOpen(true);
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!stationToDelete) return;
    setIsSaving(true);
    try {
      const result = await client.delete(stationToDelete.station_id);
      if (result.ok) {
        setSuccessMessage(
          `Station "${stationToDelete.station_name}" deleted and remaining sequence re-indexed.`
        );
        setIsDeleteModalOpen(false);
        setStationToDelete(null);
        await loadStations();
      } else {
        setErrorMessage(result.error.userMessage || 'Failed to delete station.');
      }
    } catch (err) {
      setErrorMessage(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: '1200px',
        width: '100%',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
      }}
    >
      {/* 1. Page Header with Primary Action */}
      <PageHeader
        title="Station Management"
        description="Authoritative operational station sequence, facility shortcodes, and active reporting status"
        breadcrumbs={[{ label: 'Dashboard' }, { label: 'Configuration' }, { label: 'Stations' }]}
        actions={
          <Button
            variant="primary"
            size="md"
            onClick={handleOpenAdd}
            disabled={isSaving}
            icon={
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            }
          >
            Add Station
          </Button>
        }
      />

      {/* 2. Feedback Notifications */}
      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--color-state-error-bg)',
            borderColor: 'var(--color-state-error-border)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-state-error)',
            fontSize: 'var(--font-size-sm)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
            aria-label="Dismiss error notification"
          >
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          style={{
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--color-state-success-bg)',
            borderColor: 'var(--color-state-success-border)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-state-success)',
            fontSize: 'var(--font-size-sm)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
            aria-label="Dismiss success notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. Operational Summary & Filter Bar */}
      <Card style={{ padding: 'var(--space-4)' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--space-4)',
          }}
        >
          {/* Metrics summary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Badge variant="neutral" size="md">
              Total: {totalCount}
            </Badge>
            <Badge variant="success" size="md">
              Active: {activeCount}
            </Badge>
            {inactiveCount > 0 && (
              <Badge variant="warning" size="md">
                Inactive: {inactiveCount}
              </Badge>
            )}
            <Badge variant="info" size="md">
              Sequence: 1..{totalCount > 0 ? totalCount : 0} Contiguous
            </Badge>
          </div>

          {/* Filters and search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <input
              type="search"
              placeholder="Search station or code..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Search station names or codes"
              style={{
                height: 'var(--control-height-sm)',
                padding: '0 var(--space-3)',
                fontSize: 'var(--font-size-sm)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-default)',
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                minWidth: '200px',
              }}
            />
            <Button
              variant={activeOnly ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setActiveOnly(prev => !prev)}
            >
              {activeOnly ? 'Showing Active' : 'Filter: Active Only'}
            </Button>
          </div>
        </div>
      </Card>

      {/* 4. Main Station Content Area */}
      {isLoading ? (
        <Card style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-base)' }}>
            Loading station configuration from persistence...
          </p>
        </Card>
      ) : stations.length === 0 ? (
        <Card>
          <EmptyState
            type="no-data"
            title="No Stations Configured"
            description="OpsReport Studio requires an authoritative operational station sequence to generate standardized reports. Add your first facility to establish the baseline sequence."
            action={
              <Button variant="primary" size="md" onClick={handleOpenAdd}>
                Add First Station
              </Button>
            }
          />
        </Card>
      ) : displayStations.length === 0 ? (
        <Card>
          <EmptyState
            type="no-data"
            title="No Matching Stations"
            description={`No stations matched your search query "${searchQuery}". Clear your search or filter to view the operational sequence.`}
            action={
              <Button variant="secondary" size="sm" onClick={() => setSearchQuery('')}>
                Clear Search
              </Button>
            }
          />
        </Card>
      ) : (
        <Card style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table
              role="table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--color-bg-subtle)',
                    borderBottom: '1px solid var(--color-border-default)',
                    color: 'var(--color-text-muted)',
                    fontSize: 'var(--font-size-xs)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  <th
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      width: '70px',
                      textAlign: 'center',
                    }}
                  >
                    Seq #
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Station Name</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', width: '130px' }}>
                    Facility Code
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', width: '110px' }}>
                    Status
                  </th>
                  <th
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      width: '130px',
                      textAlign: 'center',
                    }}
                  >
                    Reorder
                  </th>
                  <th
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      width: '180px',
                      textAlign: 'right',
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayStations.map((station, index) => {
                  const isFirst = index === 0;
                  const isLast = index === stations.length - 1;
                  const originalIndex = stations.findIndex(
                    s => s.station_id === station.station_id
                  );

                  return (
                    <tr
                      key={station.station_id}
                      style={{
                        borderBottom: '1px solid var(--color-border-subtle)',
                        backgroundColor: index % 2 === 0 ? 'transparent' : 'var(--color-bg-card)',
                        transition: 'background-color var(--transition-fast)',
                      }}
                    >
                      {/* Seq # (Display Order) */}
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 'var(--font-weight-bold)',
                            color: 'var(--color-text-muted)',
                          }}
                        >
                          #{station.display_order}
                        </span>
                      </td>

                      {/* Station Name */}
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span
                            style={{
                              fontWeight: 'var(--font-weight-semibold)',
                              color: 'var(--color-text-primary)',
                            }}
                          >
                            {station.station_name}
                          </span>
                          <span
                            style={{
                              fontSize: '0.6875rem',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--color-text-muted)',
                            }}
                          >
                            ID: {station.station_id}
                          </span>
                        </div>
                      </td>

                      {/* Station Code */}
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        {station.station_code ? (
                          <Badge variant="neutral" size="sm">
                            <span style={{ fontFamily: 'var(--font-mono)' }}>
                              {station.station_code}
                            </span>
                          </Badge>
                        ) : (
                          <span style={{ color: 'var(--color-text-placeholder)' }}>—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        {station.is_active === 1 ? (
                          <Badge variant="success" size="sm">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="warning" size="sm">
                            Inactive
                          </Badge>
                        )}
                      </td>

                      {/* Reorder Buttons (Move Up / Down) */}
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 'var(--space-1)' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isFirst || isSaving}
                            onClick={() => handleMoveUp(originalIndex)}
                            aria-label={`Move ${station.station_name} up in sequence`}
                            style={{ padding: '0 var(--space-2)', minWidth: '32px' }}
                          >
                            ▲
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isLast || isSaving}
                            onClick={() => handleMoveDown(originalIndex)}
                            aria-label={`Move ${station.station_name} down in sequence`}
                            style={{ padding: '0 var(--space-2)', minWidth: '32px' }}
                          >
                            ▼
                          </Button>
                        </div>
                      </td>

                      {/* Actions (Edit / Toggle / Delete) */}
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            gap: 'var(--space-2)',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEdit(station)}
                            disabled={isSaving}
                            aria-label={`Edit ${station.station_name}`}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(station)}
                            disabled={isSaving}
                            aria-label={`Toggle active status for ${station.station_name}`}
                          >
                            {station.is_active === 1 ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleOpenDelete(station)}
                            disabled={isSaving}
                            aria-label={`Delete ${station.station_name}`}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 5. Add / Edit Station Modal Dialog */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="station-modal-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: 'var(--space-4)',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-bg-card)',
              borderColor: 'var(--color-border-default)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '520px',
              width: '100%',
              padding: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-5)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2
                id="station-modal-title"
                style={{
                  margin: 0,
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 'var(--font-weight-bold)',
                  color: 'var(--color-text-primary)',
                }}
              >
                {modalMode === 'add' ? 'Add Operational Station' : 'Edit Station Details'}
              </h2>
              <button
                type="button"
                onClick={() => !isSaving && setIsModalOpen(false)}
                disabled={isSaving}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 'var(--font-size-lg)',
                  color: 'var(--color-text-muted)',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                }}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {/* Modal Error Banner */}
            {formError && (
              <div
                role="alert"
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-state-error-bg)',
                  borderColor: 'var(--color-state-error-border)',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-state-error)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                {formError}
              </div>
            )}

            {/* Modal Form */}
            <form
              onSubmit={handleFormSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
            >
              {/* Station Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
                <label
                  htmlFor="station-name-input"
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  Station Name <span style={{ color: 'var(--color-state-error)' }}>*</span>
                </label>
                <input
                  id="station-name-input"
                  type="text"
                  required
                  maxLength={150}
                  autoFocus
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Grand Central Concourse"
                  style={{
                    height: 'var(--control-height-md)',
                    padding: '0 var(--space-3)',
                    fontSize: 'var(--font-size-base)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-default)',
                    backgroundColor: 'var(--color-bg-input)',
                    color: 'var(--color-text-primary)',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  <span>Must be non-empty and case-insensitively unique.</span>
                  <span>{formName.trim().length} / 150</span>
                </div>
              </div>

              {/* Station Code */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
                <label
                  htmlFor="station-code-input"
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  Facility / Telegraphic Code{' '}
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 'normal' }}>
                    (Optional)
                  </span>
                </label>
                <input
                  id="station-code-input"
                  type="text"
                  maxLength={20}
                  value={formCode}
                  onChange={e => setFormCode(e.target.value.toUpperCase())}
                  placeholder="e.g. GCC or STN-01"
                  style={{
                    height: 'var(--control-height-md)',
                    padding: '0 var(--space-3)',
                    fontSize: 'var(--font-size-base)',
                    fontFamily: 'var(--font-mono)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-default)',
                    backgroundColor: 'var(--color-bg-input)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>

              {/* Active Toggle Checkbox */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  marginTop: 'var(--space-2)',
                }}
              >
                <input
                  id="station-active-input"
                  type="checkbox"
                  checked={formIsActive}
                  onChange={e => setFormIsActive(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label
                  htmlFor="station-active-input"
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 'var(--font-weight-medium)',
                    color: 'var(--color-text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  Active in operational report sequences
                </label>
              </div>

              {/* Readonly info in Edit mode */}
              {modalMode === 'edit' && editingStation && (
                <div
                  style={{
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--color-bg-subtle)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-muted)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-1)',
                  }}
                >
                  <div>
                    <strong>Immutable Station ID:</strong>{' '}
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {editingStation.station_id}
                    </span>
                  </div>
                  <div>
                    <strong>Current Operational Position:</strong> #{editingStation.display_order}
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 'var(--space-3)',
                  marginTop: 'var(--space-4)',
                }}
              >
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  type="submit"
                  loading={isSaving}
                  disabled={isSaving || !formName.trim()}
                >
                  {modalMode === 'add' ? 'Create Station' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Delete Confirmation Modal Dialog */}
      {isDeleteModalOpen && stationToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: 'var(--space-4)',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-bg-card)',
              borderColor: 'var(--color-state-error-border)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '480px',
              width: '100%',
              padding: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)',
            }}
          >
            <h2
              id="delete-modal-title"
              style={{
                margin: 0,
                fontSize: 'var(--font-size-xl)',
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-state-error)',
              }}
            >
              Delete Station?
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                lineHeight: 'var(--line-height-normal)',
              }}
            >
              Are you sure you want to permanently delete{' '}
              <strong style={{ color: 'var(--color-text-primary)' }}>
                &ldquo;{stationToDelete.station_name}&rdquo;
              </strong>{' '}
              (Position #{stationToDelete.display_order})?
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-muted)',
              }}
            >
              Remaining stations will be automatically re-indexed within a transaction to maintain a
              contiguous 1..N sequence without gaps.
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--space-3)',
                marginTop: 'var(--space-2)',
              }}
            >
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setStationToDelete(null);
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={handleConfirmDelete}
                loading={isSaving}
                disabled={isSaving}
              >
                Delete Station
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
