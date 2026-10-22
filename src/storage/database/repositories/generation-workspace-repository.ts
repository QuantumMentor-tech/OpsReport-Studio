/**
 * OpsReport Studio — Authoritative Generation Workspace Repository (Step 26 Baseline)
 *
 * Implements centralized SQLite persistence for isolated report generation workspaces:
 * - Generation workspace record persistence (UUID primary key)
 * - Association to report_sessions (ON DELETE SET NULL)
 * - Association to template_metadata (ON DELETE RESTRICT)
 * - Association to template_versions (ON DELETE RESTRICT)
 * - Workspace lifecycle transitions (PREPARED -> IN_USE -> COMPLETED | DISCARDED)
 * - Session-scoped active workspace querying and discarding
 *
 * @module storage/database/repositories/generation-workspace-repository
 */

import type Database from 'better-sqlite3';
import type {
  GenerationWorkspaceRecord,
  GenerationWorkspaceStatus,
  GenerationWorkspaceFilter,
} from '../../../shared/types/generation.ts';
import type { ReportDocumentFormat } from '../../../shared/types/categories.ts';
import {
  GenerationWorkspaceId,
  toGenerationWorkspaceId,
  toReportSessionId,
  toTemplateId,
  toTemplateVersionId,
  ReportSessionId,
} from '../../../shared/types/identifiers.ts';
import { VaultManager } from '../../vault/vault-manager.ts';
import { Result, Ok, Err } from '../../../shared/types/result.ts';
import { AppError } from '../../../shared/errors/app-error.ts';
import { ErrorCode } from '../../../shared/errors/error-codes.ts';

interface RawGenerationWorkspaceRow {
  workspace_id: string;
  session_id: string | null;
  template_id: string;
  version_id: string;
  version_number: number;
  document_type: ReportDocumentFormat;
  file_name: string;
  relative_path: string;
  sha256_hash: string;
  file_size_bytes: number;
  status: GenerationWorkspaceStatus;
  created_at: string;
  updated_at: string;
}

export class GenerationWorkspaceRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly vaultManager?: VaultManager
  ) {}

  private resolveVaultManager(): VaultManager {
    return this.vaultManager ?? VaultManager.getInstance();
  }

  /**
   * Transforms a database row into a strongly-typed GenerationWorkspaceRecord,
   * computing the current runtime absolute path via the VaultManager.
   */
  private mapRowToRecord(row: RawGenerationWorkspaceRow): GenerationWorkspaceRecord {
    const vault = this.resolveVaultManager();
    const absPathRes = vault.resolveWorkspacePath(row.file_name);
    const absolutePath = absPathRes.ok ? absPathRes.value : '';

    return {
      workspaceId: toGenerationWorkspaceId(row.workspace_id),
      sessionId: row.session_id ? toReportSessionId(row.session_id) : null,
      templateId: toTemplateId(row.template_id),
      versionId: toTemplateVersionId(row.version_id),
      versionNumber: row.version_number,
      documentType: row.document_type,
      fileName: row.file_name,
      relativePath: row.relative_path,
      absolutePath,
      sha256Hash: row.sha256_hash,
      fileSizeBytes: row.file_size_bytes,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Persists a newly created generation workspace record.
   */
  public createWorkspace(
    input: Omit<GenerationWorkspaceRecord, 'absolutePath' | 'createdAt' | 'updatedAt'>
  ): Result<GenerationWorkspaceRecord, AppError> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO generation_workspaces (
          workspace_id, session_id, template_id, version_id, version_number,
          document_type, file_name, relative_path, sha256_hash, file_size_bytes,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      stmt.run(
        input.workspaceId,
        input.sessionId ?? null,
        input.templateId,
        input.versionId,
        input.versionNumber,
        input.documentType,
        input.fileName,
        input.relativePath,
        input.sha256Hash,
        input.fileSizeBytes,
        input.status
      );

      const fetched = this.getWorkspaceById(input.workspaceId);
      if (!fetched.ok || !fetched.value) {
        return Err(
          new AppError({
            code: ErrorCode.PERSISTENCE_FAILED,
            userMessage: `Failed to retrieve newly created generation workspace "${input.workspaceId}".`,
            isOperational: true,
          })
        );
      }

      return Ok(fetched.value);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to insert generation workspace record.',
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves a generation workspace record by its unique identifier.
   */
  public getWorkspaceById(
    workspaceId: GenerationWorkspaceId
  ): Result<GenerationWorkspaceRecord | null, AppError> {
    try {
      const stmt = this.db.prepare(`
        SELECT workspace_id, session_id, template_id, version_id, version_number,
               document_type, file_name, relative_path, sha256_hash, file_size_bytes,
               status, created_at, updated_at
        FROM generation_workspaces
        WHERE workspace_id = ?
      `);

      const row = stmt.get(workspaceId) as RawGenerationWorkspaceRow | undefined;
      return Ok(row ? this.mapRowToRecord(row) : null);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to retrieve generation workspace "${workspaceId}".`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves the current active ('PREPARED' or 'IN_USE') workspace for a report session.
   */
  public getActiveWorkspaceBySessionId(
    sessionId: ReportSessionId
  ): Result<GenerationWorkspaceRecord | null, AppError> {
    try {
      const stmt = this.db.prepare(`
        SELECT workspace_id, session_id, template_id, version_id, version_number,
               document_type, file_name, relative_path, sha256_hash, file_size_bytes,
               status, created_at, updated_at
        FROM generation_workspaces
        WHERE session_id = ? AND status IN ('PREPARED', 'IN_USE')
        ORDER BY created_at DESC
        LIMIT 1
      `);

      const row = stmt.get(sessionId) as RawGenerationWorkspaceRow | undefined;
      return Ok(row ? this.mapRowToRecord(row) : null);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to retrieve active workspace for session "${sessionId}".`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Queries generation workspaces with filtering and pagination.
   */
  public listWorkspaces(
    filter?: GenerationWorkspaceFilter
  ): Result<GenerationWorkspaceRecord[], AppError> {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filter?.sessionId) {
        conditions.push('session_id = ?');
        params.push(filter.sessionId);
      }

      if (filter?.templateId) {
        conditions.push('template_id = ?');
        params.push(filter.templateId);
      }

      if (filter?.status) {
        if (Array.isArray(filter.status)) {
          const placeholders = filter.status.map(() => '?').join(', ');
          conditions.push(`status IN (${placeholders})`);
          params.push(...filter.status);
        } else {
          conditions.push('status = ?');
          params.push(filter.status);
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = filter?.limit ?? 50;
      const offset = filter?.offset ?? 0;

      const query = `
        SELECT workspace_id, session_id, template_id, version_id, version_number,
               document_type, file_name, relative_path, sha256_hash, file_size_bytes,
               status, created_at, updated_at
        FROM generation_workspaces
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;

      params.push(limit, offset);

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as RawGenerationWorkspaceRow[];
      return Ok(rows.map(r => this.mapRowToRecord(r)));
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to query generation workspaces.',
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Updates the lifecycle status of a generation workspace.
   */
  public updateWorkspaceStatus(
    workspaceId: GenerationWorkspaceId,
    status: GenerationWorkspaceStatus
  ): Result<boolean, AppError> {
    try {
      const stmt = this.db.prepare(`
        UPDATE generation_workspaces
        SET status = ?, updated_at = datetime('now')
        WHERE workspace_id = ?
      `);

      const info = stmt.run(status, workspaceId);
      return Ok(info.changes > 0);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to update status for workspace "${workspaceId}".`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Updates the file attributes (hash, size, status) of an active generation workspace.
   */
  public updateWorkspaceFile(
    workspaceId: GenerationWorkspaceId,
    updates: {
      sha256Hash: string;
      fileSizeBytes: number;
      status?: GenerationWorkspaceStatus;
    }
  ): Result<GenerationWorkspaceRecord, AppError> {
    try {
      const status = updates.status ?? 'IN_USE';
      const stmt = this.db.prepare(`
        UPDATE generation_workspaces
        SET sha256_hash = ?, file_size_bytes = ?, status = ?, updated_at = datetime('now')
        WHERE workspace_id = ?
      `);

      stmt.run(updates.sha256Hash, updates.fileSizeBytes, status, workspaceId);

      const recordRes = this.getWorkspaceById(workspaceId);
      if (!recordRes.ok) {
        return recordRes;
      }
      if (!recordRes.value) {
        return Err(
          new AppError({
            code: ErrorCode.FILE_NOT_FOUND,
            userMessage: `Workspace "${workspaceId}" not found after update.`,
            isOperational: true,
          })
        );
      }
      return Ok(recordRes.value);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to update workspace file metadata for "${workspaceId}".`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Discards any active (PREPARED or IN_USE) workspace for a report session.
   */
  public discardActiveSessionWorkspaces(sessionId: ReportSessionId): Result<number, AppError> {
    try {
      const stmt = this.db.prepare(`
        UPDATE generation_workspaces
        SET status = 'DISCARDED', updated_at = datetime('now')
        WHERE session_id = ? AND status IN ('PREPARED', 'IN_USE')
      `);

      const info = stmt.run(sessionId);
      return Ok(info.changes);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to discard active workspaces for session "${sessionId}".`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Deletes a generation workspace record from database.
   */
  public deleteWorkspace(workspaceId: GenerationWorkspaceId): Result<boolean, AppError> {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM generation_workspaces
        WHERE workspace_id = ?
      `);

      const info = stmt.run(workspaceId);
      return Ok(info.changes > 0);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to delete workspace record "${workspaceId}".`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }
}
