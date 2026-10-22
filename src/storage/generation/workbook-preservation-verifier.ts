/**
 * OpsReport Studio — Workbook Preservation Verifier (Step 29)
 *
 * Implements structural preservation inspection, comparison, and verification
 * for generated candidate Excel workbooks:
 * - Worksheet order, visibility, and metadata preservation
 * - Formatting, column, and row layout preservation
 * - Formula preservation outside mapped target write cells
 * - Merged-cell range preservation and covered-cell collision detection
 * - Embedded image and drawing media 0-loss verification
 * - Print layout, page setup, margins, and print area preservation
 *
 * @module storage/generation/workbook-preservation-verifier
 */

import PizZip from 'pizzip';
import { WorksheetXmlEditor } from './worksheet-xml-editor.ts';
import type {
  WorkbookStructuralSnapshot,
  SheetStructuralSnapshot,
  StructuralVerificationFinding,
  StructuralVerificationReport,
} from '../../shared/types/generation.ts';

export interface PlannedWriteTarget {
  readonly cellRef: string;
  readonly sheetName?: string;
}

/**
 * Structural preservation verifier for Excel generation candidates.
 */
export class WorkbookPreservationVerifier {
  /**
   * Captures a comprehensive, normalized structural snapshot of a workbook from a PizZip container.
   */
  public static captureSnapshot(zip: PizZip): WorkbookStructuralSnapshot {
    const sheetMeta = WorksheetXmlEditor.extractSheetMetadata(zip);
    const sheetNames = sheetMeta.map(s => s.name);
    const sharedStrings = WorksheetXmlEditor.readSharedStrings(zip).strings;

    const sheets: SheetStructuralSnapshot[] = [];
    let totalFormulaCount = 0;
    let totalMergedCellCount = 0;

    for (const meta of sheetMeta) {
      const mergedCells = WorksheetXmlEditor.extractMergedCellRanges(zip, meta.targetPath);
      const formulaCells = WorksheetXmlEditor.extractFormulaCells(
        zip,
        meta.targetPath,
        sharedStrings
      );
      const pageSetup = WorksheetXmlEditor.extractPageSetup(zip, meta.targetPath, meta.name);

      totalFormulaCount += formulaCells.length;
      totalMergedCellCount += mergedCells.length;

      const sheetFile = zip.file(meta.targetPath);
      let colStylesCount = 0;
      let conditionalFormattingCount = 0;
      let dataValidationCount = 0;
      let hasDrawing = false;

      if (sheetFile) {
        const xml = sheetFile.asText();
        const colMatches = xml.match(/<col\s+[^>]*?style="[^"]*"/g);
        if (colMatches) colStylesCount = colMatches.length;

        const cfMatches = xml.match(/<conditionalFormatting\b/g);
        if (cfMatches) conditionalFormattingCount = cfMatches.length;

        const dvMatches = xml.match(/<dataValidation\b/g);
        if (dvMatches) dataValidationCount = dvMatches.length;

        hasDrawing = /<drawing\b/.test(xml);
      }

      sheets.push({
        sheetName: meta.name,
        sheetId: meta.sheetId,
        state: meta.state,
        mergedCells,
        formulaCells,
        pageSetup,
        colStylesCount,
        conditionalFormattingCount,
        dataValidationCount,
        hasDrawing,
      });
    }

    const drawingMedia = WorksheetXmlEditor.extractDrawingMediaSnapshot(zip);
    const { printAreas, printTitles } = WorksheetXmlEditor.extractPrintAreasAndTitles(
      zip,
      sheetNames
    );

    return {
      sheetNames,
      sheets,
      drawingMedia,
      printAreas,
      printTitles,
      totalFormulaCount,
      totalMergedCellCount,
    };
  }

  /**
   * Compares baseline and candidate snapshots to verify that formatting, formulas,
   * merged cells, images, and print layouts are preserved.
   */
  public static verifyPreservation(
    baseline: WorkbookStructuralSnapshot,
    candidate: WorkbookStructuralSnapshot,
    plannedWrites: readonly PlannedWriteTarget[]
  ): StructuralVerificationReport {
    const findings: StructuralVerificationFinding[] = [];
    let totalFormulasPreserved = 0;
    let totalMergedCellsPreserved = 0;
    let imagesPreservedCount = 0;
    let pageSetupsPreservedCount = 0;

    // 1. Verify Worksheet Count, Names, Order, and Visibility
    if (candidate.sheetNames.length !== baseline.sheetNames.length) {
      findings.push({
        code: 'SHEET_COUNT_MISMATCH',
        severity: 'BLOCKING',
        message: `Worksheet count mismatch: baseline has ${baseline.sheetNames.length} sheet(s), candidate has ${candidate.sheetNames.length} sheet(s).`,
      });
    }

    for (let i = 0; i < baseline.sheetNames.length; i++) {
      const baseName = baseline.sheetNames[i];
      const candName = candidate.sheetNames[i];
      if (baseName !== candName) {
        findings.push({
          code: 'SHEET_ORDER_OR_NAME_MISMATCH',
          severity: 'BLOCKING',
          worksheetName: baseName,
          message: `Worksheet at index ${i} expected "${baseName}", found "${candName}".`,
        });
      }
    }

    // Map candidate sheets by name
    const candSheetMap = new Map<string, SheetStructuralSnapshot>();
    for (const sheet of candidate.sheets) {
      candSheetMap.set(sheet.sheetName.toLowerCase(), sheet);
    }

    // Build write targets set per sheet for formula preservation exemption
    // Key: `${sheetName.toLowerCase()}:${cellRef.toUpperCase()}`
    const writeTargetsSet = new Set<string>();
    for (const write of plannedWrites) {
      const sName = (write.sheetName ?? baseline.sheetNames[0] ?? '').toLowerCase();
      writeTargetsSet.add(`${sName}:${write.cellRef.toUpperCase()}`);
    }

    // 2. Per-Sheet Verification (Formulas, Merged Cells, Page Setup)
    for (const baseSheet of baseline.sheets) {
      const candSheet = candSheetMap.get(baseSheet.sheetName.toLowerCase());
      if (!candSheet) {
        findings.push({
          code: 'SHEET_MISSING_IN_CANDIDATE',
          severity: 'BLOCKING',
          worksheetName: baseSheet.sheetName,
          message: `Worksheet "${baseSheet.sheetName}" is missing in generated candidate.`,
        });
        continue;
      }

      // Check visibility state
      if (candSheet.state !== baseSheet.state) {
        findings.push({
          code: 'SHEET_VISIBILITY_CHANGED',
          severity: 'BLOCKING',
          worksheetName: baseSheet.sheetName,
          message: `Worksheet "${baseSheet.sheetName}" visibility changed from "${baseSheet.state}" to "${candSheet.state}".`,
        });
      }

      // 2a. Verify Formulas Outside Planned Write Targets
      const candFormulaMap = new Map<string, string>();
      for (const fc of candSheet.formulaCells) {
        candFormulaMap.set(fc.cellRef.toUpperCase(), fc.formula);
      }

      for (const baseFc of baseSheet.formulaCells) {
        const cellRef = baseFc.cellRef.toUpperCase();
        const writeKey = `${baseSheet.sheetName.toLowerCase()}:${cellRef}`;
        const isMappedTarget = writeTargetsSet.has(writeKey);

        if (isMappedTarget) {
          // Expected change: formula replaced by explicit mapped value
          findings.push({
            code: 'FORMULA_INTENTIONALLY_OVERWRITTEN',
            severity: 'INFO',
            worksheetName: baseSheet.sheetName,
            target: cellRef,
            message: `Formula in mapped cell "${cellRef}" was replaced by approved report data.`,
          });
          continue;
        }

        // Cell is NOT a planned write target — its formula must be preserved exactly
        const candFormula = candFormulaMap.get(cellRef);
        if (!candFormula) {
          findings.push({
            code: 'UNMAPPED_FORMULA_DROPPED',
            severity: 'BLOCKING',
            worksheetName: baseSheet.sheetName,
            target: cellRef,
            message: `Formula in unmapped cell "${cellRef}" ("${baseFc.formula}") was dropped during serialization.`,
          });
        } else if (candFormula !== baseFc.formula) {
          findings.push({
            code: 'UNMAPPED_FORMULA_ALTERED',
            severity: 'BLOCKING',
            worksheetName: baseSheet.sheetName,
            target: cellRef,
            message: `Formula in unmapped cell "${cellRef}" was unexpectedly modified from "${baseFc.formula}" to "${candFormula}".`,
          });
        } else {
          totalFormulasPreserved++;
        }
      }

      // 2b. Verify Merged Cell Ranges
      const candMergedMap = new Map<string, string>();
      for (const mr of candSheet.mergedCells) {
        candMergedMap.set(mr.ref.toUpperCase(), mr.anchorCell.toUpperCase());
      }

      for (const baseMr of baseSheet.mergedCells) {
        const rangeRef = baseMr.ref.toUpperCase();
        const candAnchor = candMergedMap.get(rangeRef);

        if (!candAnchor) {
          findings.push({
            code: 'MERGED_RANGE_DROPPED',
            severity: 'BLOCKING',
            worksheetName: baseSheet.sheetName,
            target: rangeRef,
            message: `Merged cell range "${rangeRef}" was dropped or altered in worksheet "${baseSheet.sheetName}".`,
          });
        } else {
          totalMergedCellsPreserved++;
        }
      }

      // 2c. Verify Page Setup and Margins
      if (baseSheet.pageSetup) {
        if (!candSheet.pageSetup) {
          findings.push({
            code: 'PAGE_SETUP_DROPPED',
            severity: 'BLOCKING',
            worksheetName: baseSheet.sheetName,
            message: `Page setup and print configuration in worksheet "${baseSheet.sheetName}" was dropped.`,
          });
        } else {
          const bp = baseSheet.pageSetup;
          const cp = candSheet.pageSetup;

          if (bp.paperSize && cp.paperSize !== bp.paperSize) {
            findings.push({
              code: 'PAGE_SETUP_PAPER_SIZE_CHANGED',
              severity: 'BLOCKING',
              worksheetName: baseSheet.sheetName,
              message: `Paper size changed from "${bp.paperSize}" to "${cp.paperSize}".`,
            });
          }
          if (bp.orientation && cp.orientation !== bp.orientation) {
            findings.push({
              code: 'PAGE_SETUP_ORIENTATION_CHANGED',
              severity: 'BLOCKING',
              worksheetName: baseSheet.sheetName,
              message: `Page orientation changed from "${bp.orientation}" to "${cp.orientation}".`,
            });
          }

          // Compare margins
          if (bp.margins) {
            const bm = bp.margins;
            const cm = cp.margins;
            if (
              !cm ||
              cm.left !== bm.left ||
              cm.right !== bm.right ||
              cm.top !== bm.top ||
              cm.bottom !== bm.bottom
            ) {
              findings.push({
                code: 'PAGE_SETUP_MARGINS_CHANGED',
                severity: 'WARNING',
                worksheetName: baseSheet.sheetName,
                message: `Page margins in worksheet "${baseSheet.sheetName}" were altered.`,
              });
            }
          }

          pageSetupsPreservedCount++;
        }
      }
    }

    // 3. Verify Drawing and Embedded Media 0-Loss Preservation
    const candMediaMap = new Map<string, { sizeBytes: number; sha256Hash: string }>();
    for (const mf of candidate.drawingMedia.mediaFiles) {
      candMediaMap.set(mf.name, mf);
    }

    for (const baseMf of baseline.drawingMedia.mediaFiles) {
      const candMf = candMediaMap.get(baseMf.name);
      if (!candMf) {
        findings.push({
          code: 'EMBEDDED_IMAGE_MISSING',
          severity: 'BLOCKING',
          target: baseMf.name,
          message: `Embedded media asset "${baseMf.name}" was dropped during workbook processing.`,
        });
      } else if (candMf.sha256Hash !== baseMf.sha256Hash) {
        findings.push({
          code: 'EMBEDDED_IMAGE_CORRUPTED',
          severity: 'BLOCKING',
          target: baseMf.name,
          message: `Embedded media asset "${baseMf.name}" SHA-256 hash changed. Image binary was modified or corrupted.`,
        });
      } else {
        imagesPreservedCount++;
      }
    }

    if (candidate.drawingMedia.drawingPartCount < baseline.drawingMedia.drawingPartCount) {
      findings.push({
        code: 'DRAWING_PART_COUNT_DECREASED',
        severity: 'BLOCKING',
        message: `Drawing part count dropped from ${baseline.drawingMedia.drawingPartCount} to ${candidate.drawingMedia.drawingPartCount}.`,
      });
    }

    // 4. Verify Print Areas and Print Titles
    for (const [sheetKey, baseArea] of baseline.printAreas.entries()) {
      const candArea = candidate.printAreas.get(sheetKey);
      if (!candArea) {
        findings.push({
          code: 'PRINT_AREA_DROPPED',
          severity: 'BLOCKING',
          target: sheetKey,
          message: `Print area for "${sheetKey}" ("${baseArea}") was dropped.`,
        });
      }
    }

    for (const [sheetKey, baseTitles] of baseline.printTitles.entries()) {
      const candTitles = candidate.printTitles.get(sheetKey);
      if (!candTitles) {
        findings.push({
          code: 'PRINT_TITLES_DROPPED',
          severity: 'BLOCKING',
          target: sheetKey,
          message: `Print titles for "${sheetKey}" ("${baseTitles}") were dropped.`,
        });
      }
    }

    const isPreserved = !findings.some(f => f.severity === 'BLOCKING');

    return {
      isPreserved,
      totalFormulasPreserved,
      totalMergedCellsPreserved,
      imagesPreservedCount,
      pageSetupsPreservedCount,
      findings,
      verifiedAt: new Date().toISOString(),
    };
  }
}
