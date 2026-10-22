/**
 * OpsReport Studio — Template Designer Renderer Client Service (Step 25)
 *
 * Provides typed frontend access to the Template Designer backend:
 * - Draft lifecycle management (listing, creating, updating, deleting)
 * - In-app design validation against authoritative field catalog (DIC-OPSREPORT-001)
 * - Safe compilation, staging, and registration into master template vault
 * - Includes both Electron IPC-backed and in-memory mock client implementations
 *
 * @module renderer/services/designer-client
 */

import type {
  DesignerDocumentType,
  DesignerDraftRecord,
  DesignerDraftSummary,
  CreateDesignerDraftInput,
  UpdateDesignerDraftInput,
  TemplateDesignDefinition,
  DesignerValidationResult,
  CompileAndRegisterInput,
  CompileAndRegisterResult,
} from '../../shared/types/template-designer.ts';
import type { SerializableError } from '../../shared/errors/app-error.ts';
import type { OpsReportBridgeAPI } from '../../shared/types/metadata.ts';
import { Result, Ok, Err } from '../../shared/types/result.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';

function getOpsReportBridge(): OpsReportBridgeAPI | undefined {
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as unknown as {
      opsreport?: OpsReportBridgeAPI;
      window?: { opsreport?: OpsReportBridgeAPI };
    };
    return g.opsreport ?? g.window?.opsreport;
  }
  return undefined;
}

function makeError(code: ErrorCode, userMessage: string): SerializableError {
  return {
    code,
    userMessage,
    isOperational: true,
    timestamp: new Date().toISOString(),
  };
}

export interface IDesignerClient {
  listDrafts(
    documentType?: DesignerDocumentType,
    categoryId?: string
  ): Promise<Result<DesignerDraftSummary[], SerializableError>>;
  getDraft(draftId: string): Promise<Result<DesignerDraftRecord | null, SerializableError>>;
  createDraft(
    input: CreateDesignerDraftInput
  ): Promise<Result<DesignerDraftRecord, SerializableError>>;
  updateDraft(
    draftId: string,
    input: UpdateDesignerDraftInput
  ): Promise<Result<DesignerDraftRecord, SerializableError>>;
  deleteDraft(draftId: string): Promise<Result<boolean, SerializableError>>;
  validateDesign(
    definition: TemplateDesignDefinition,
    categoryId?: string
  ): Promise<Result<DesignerValidationResult, SerializableError>>;
  compileAndRegister(
    input: CompileAndRegisterInput
  ): Promise<Result<CompileAndRegisterResult, SerializableError>>;
}

export class ElectronDesignerClient implements IDesignerClient {
  public async listDrafts(
    documentType?: DesignerDocumentType,
    categoryId?: string
  ): Promise<Result<DesignerDraftSummary[], SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.designer) {
      return Err(
        makeError(ErrorCode.IPC_COMMUNICATION_FAILED, 'Designer IPC bridge not available.')
      );
    }
    return bridge.designer.listDrafts(documentType, categoryId);
  }

  public async getDraft(
    draftId: string
  ): Promise<Result<DesignerDraftRecord | null, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.designer) {
      return Err(
        makeError(ErrorCode.IPC_COMMUNICATION_FAILED, 'Designer IPC bridge not available.')
      );
    }
    return bridge.designer.getDraft(draftId);
  }

  public async createDraft(
    input: CreateDesignerDraftInput
  ): Promise<Result<DesignerDraftRecord, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.designer) {
      return Err(
        makeError(ErrorCode.IPC_COMMUNICATION_FAILED, 'Designer IPC bridge not available.')
      );
    }
    return bridge.designer.createDraft(input);
  }

  public async updateDraft(
    draftId: string,
    input: UpdateDesignerDraftInput
  ): Promise<Result<DesignerDraftRecord, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.designer) {
      return Err(
        makeError(ErrorCode.IPC_COMMUNICATION_FAILED, 'Designer IPC bridge not available.')
      );
    }
    return bridge.designer.updateDraft(draftId, input);
  }

  public async deleteDraft(draftId: string): Promise<Result<boolean, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.designer) {
      return Err(
        makeError(ErrorCode.IPC_COMMUNICATION_FAILED, 'Designer IPC bridge not available.')
      );
    }
    return bridge.designer.deleteDraft(draftId);
  }

  public async validateDesign(
    definition: TemplateDesignDefinition,
    categoryId?: string
  ): Promise<Result<DesignerValidationResult, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.designer) {
      return Err(
        makeError(ErrorCode.IPC_COMMUNICATION_FAILED, 'Designer IPC bridge not available.')
      );
    }
    return bridge.designer.validateDesign(definition, categoryId);
  }

  public async compileAndRegister(
    input: CompileAndRegisterInput
  ): Promise<Result<CompileAndRegisterResult, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.designer) {
      return Err(
        makeError(ErrorCode.IPC_COMMUNICATION_FAILED, 'Designer IPC bridge not available.')
      );
    }
    return bridge.designer.compileAndRegister(input);
  }
}

export class InMemoryDesignerClient implements IDesignerClient {
  private drafts: Map<string, DesignerDraftRecord> = new Map();

  public async listDrafts(
    documentType?: DesignerDocumentType,
    categoryId?: string
  ): Promise<Result<DesignerDraftSummary[], SerializableError>> {
    let list = Array.from(this.drafts.values());
    if (documentType) {
      list = list.filter(d => d.document_type === documentType);
    }
    if (categoryId) {
      list = list.filter(d => d.category_id === categoryId);
    }
    const summaries: DesignerDraftSummary[] = list.map(d => ({
      draftId: d.draft_id,
      name: d.name,
      description: d.description,
      documentType: d.document_type,
      categoryId: d.category_id,
      targetTemplateId: d.target_template_id,
      updatedAt: d.updated_at,
      createdAt: d.created_at,
    }));
    return Ok(summaries);
  }

  public async getDraft(
    draftId: string
  ): Promise<Result<DesignerDraftRecord | null, SerializableError>> {
    const draft = this.drafts.get(draftId) ?? null;
    return Ok(draft);
  }

  public async createDraft(
    input: CreateDesignerDraftInput
  ): Promise<Result<DesignerDraftRecord, SerializableError>> {
    const draftId = `draft-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const record: DesignerDraftRecord = {
      draft_id: draftId,
      name: input.name,
      description: input.description ?? null,
      document_type: input.documentType,
      category_id: input.categoryId ?? null,
      target_template_id: input.targetTemplateId ?? null,
      design_schema_version: 1,
      design_definition: JSON.stringify(input.designDefinition),
      created_at: now,
      updated_at: now,
    };
    this.drafts.set(draftId, record);
    return Ok(record);
  }

  public async updateDraft(
    draftId: string,
    input: UpdateDesignerDraftInput
  ): Promise<Result<DesignerDraftRecord, SerializableError>> {
    const existing = this.drafts.get(draftId);
    if (!existing) {
      return Err(makeError(ErrorCode.TEMPLATE_NOT_FOUND, 'Draft not found.'));
    }
    const updated: DesignerDraftRecord = {
      ...existing,
      name: input.name ?? existing.name,
      description:
        input.description !== undefined ? (input.description ?? null) : existing.description,
      category_id:
        input.categoryId !== undefined ? (input.categoryId ?? null) : existing.category_id,
      target_template_id:
        input.targetTemplateId !== undefined
          ? (input.targetTemplateId ?? null)
          : existing.target_template_id,
      design_definition:
        input.designDefinition !== undefined
          ? JSON.stringify(input.designDefinition)
          : existing.design_definition,
      updated_at: new Date().toISOString(),
    };
    this.drafts.set(draftId, updated);
    return Ok(updated);
  }

  public async deleteDraft(draftId: string): Promise<Result<boolean, SerializableError>> {
    const existed = this.drafts.delete(draftId);
    return Ok(existed);
  }

  public async validateDesign(
    _definition: TemplateDesignDefinition,
    _categoryId?: string
  ): Promise<Result<DesignerValidationResult, SerializableError>> {
    return Ok({
      isValid: true,
      diagnostics: [],
      errorCount: 0,
      warningCount: 0,
    });
  }

  public async compileAndRegister(
    input: CompileAndRegisterInput
  ): Promise<Result<CompileAndRegisterResult, SerializableError>> {
    return Ok({
      templateId: input.targetTemplateId || `tpl-${Date.now()}`,
      versionId: `ver-${Date.now()}`,
      versionNumber: 1,
      profileId: `prof-${Date.now()}`,
      message: `Template "${input.name}" compiled and registered successfully.`,
    });
  }
}

export function createDesignerClient(): IDesignerClient {
  const bridge = getOpsReportBridge();
  if (bridge?.designer) {
    return new ElectronDesignerClient();
  }
  return new InMemoryDesignerClient();
}
