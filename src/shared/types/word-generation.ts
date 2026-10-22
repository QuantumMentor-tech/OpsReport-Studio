/**
 * OpsReport Studio — Word Generation Domain Types (Step 31)
 *
 * Contracts for Word template cloning, placeholder replacement planning,
 * main-body replacement and candidate validation.
 *
 * @module shared/types/word-generation
 */

import type {
  GenerationWorkspaceId,
  MappingProfileId,
  ReportSessionId,
  TemplateId,
  TemplateVersionId,
} from './identifiers.ts';
import type { GenerationWorkspaceRecord } from './generation.ts';
import type { TemplateMetadataRecord, TemplateVersionRecord } from './templates.ts';

/** Options for cloning an approved Word master template into the Generation Workspace. */
export interface CreateWordCloneOptions {
  readonly templateId: TemplateId;
  /** Defaults to the active version when omitted. */
  readonly versionId?: TemplateVersionId;
  readonly sessionId?: ReportSessionId;
  /** Safe alphanumeric filename prefix (no traversal characters). */
  readonly customPrefix?: string;
  /** Discard prepared/in-use workspaces for the same session (default: true). */
  readonly replaceExistingSessionWorkspace?: boolean;
}

export interface WordCloneResult {
  readonly workspace: GenerationWorkspaceRecord;
  readonly sourceTemplate: TemplateMetadataRecord;
  readonly sourceVersion: TemplateVersionRecord;
  readonly isVerified: boolean;
  readonly sourceUntouched: boolean;
}

/** Where a recognised placeholder token was found in the package. */
export type WordPlaceholderLocation =
  | 'BODY'
  | 'TABLE'
  | 'TEXT_BOX'
  | 'HEADER'
  | 'FOOTER'
  | 'FOOTNOTE'
  | 'ENDNOTE'
  | 'COMMENT'
  | 'UNSAFE_PARAGRAPH';

/** Generation stages used to report actionable failures. */
export type WordGenerationStage =
  | 'SOURCE_TEMPLATE'
  | 'MAPPING_PLAN'
  | 'REPLACEMENT'
  | 'CANDIDATE_SAVE'
  | 'REOPEN'
  | 'COMPLETENESS'
  | 'ACCEPTANCE';

export type WordGenerationIssueCode =
  | 'UNSUPPORTED_MAPPING_TYPE'
  | 'UNAUTHORIZED_FIELD'
  | 'REPEATING_FIELD_UNSUPPORTED'
  | 'AMBIGUOUS_MAPPING'
  | 'MISSING_REQUIRED_VALUE'
  | 'INVALID_VALUE_TYPE'
  | 'INVALID_VALUE_CONTENT'
  | 'PLACEHOLDER_NOT_FOUND'
  | 'PLACEHOLDER_UNSUPPORTED_LOCATION'
  | 'PLACEHOLDER_UNSAFE_CONSTRUCT'
  | 'UNKNOWN_PLACEHOLDER'
  | 'UNRESOLVED_PLACEHOLDER'
  | 'CONTENT_MISMATCH'
  | 'PRESERVATION_MISMATCH'
  | 'STRUCTURE_MISMATCH'
  | 'MISSING_TARGET_TABLE'
  | 'MISSING_MAPPED_CELL'
  | 'INVALID_TABLE_DIMENSIONS'
  | 'UNSUPPORTED_MERGE_LAYOUT'
  | 'INVALID_REPEATABLE_ROW_CONFIG'
  | 'MISSING_SOURCE_COLLECTION'
  | 'INVALID_REPEATED_RECORD_FIELD'
  | 'FORMATTING_PRESERVATION_FAILURE';

/** Compact, value-free diagnostic. Never contains report values. */
export interface WordGenerationIssue {
  readonly stage: WordGenerationStage;
  readonly code: WordGenerationIssueCode;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly fieldId?: string;
  readonly token?: string;
  readonly location?: WordPlaceholderLocation;
}

/** One planned replacement. Holds no report values. */
export interface WordPlannedReplacement {
  readonly fieldId: string;
  readonly fieldLabel: string;
  readonly token: string;
  readonly isRequired: boolean;
  readonly expectedOccurrences: number;
  /** True when the token appears more than once in supported paragraphs. */
  readonly isRepeated: boolean;
  /** Target coordinate if mapped via TABLE_CELL or REPEATING_ROW */
  readonly targetCoordinate?: string;
  readonly mappingType?: 'PLACEHOLDER' | 'TABLE_CELL' | 'REPEATING_ROW';
  readonly tableIndex?: number;
  readonly rowIndex?: number;
  readonly colIndex?: number;
}

/** Options for a Word generation request. */
export interface GenerateWordDocumentOptions {
  readonly workspaceId: GenerationWorkspaceId;
  readonly sessionId: ReportSessionId;
  readonly profileId?: MappingProfileId;
  /** Test/preview override of the session payload; authoritative session data otherwise. */
  readonly overrideFormData?: Record<string, unknown>;
  /** Downgrade unmapped body tokens from errors to warnings (default: false). */
  readonly allowUnmappedTokens?: boolean;
}

export interface WordGenerationResult {
  readonly workspace: GenerationWorkspaceRecord;
  readonly plan: readonly WordPlannedReplacement[];
  readonly replacementsApplied: number;
  readonly tableRowsGenerated?: number;
  readonly warnings: readonly WordGenerationIssue[];
  readonly masterUntouched: boolean;
  readonly candidateAccepted: boolean;
  readonly sha256Hash: string;
}
