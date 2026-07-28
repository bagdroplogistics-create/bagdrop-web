// BAGDROP — lib/indemnity-pdf.ts
//
// Fills the EXISTING indemnity bond PDF (public/legal/indemnity-bond-template.pdf)
// by overlaying text + a signature image onto the original page — the source
// document's legal content, wording, and layout are never touched or
// regenerated. Coordinates below were measured directly off the real PDF
// (pdfplumber word boxes + PyMuPDF vector line positions) and visually
// verified by rendering test fills before being hardcoded here — they are
// specific to this one template and will need re-measuring if the template
// PDF is ever replaced with a different layout.
//
// Coordinate system note: pdf-lib uses PDF-native bottom-left origin (y
// increases upward). The constants below are stored as "top" distances (as
// measured from the top of the page, top-left origin — the same convention
// pdfplumber/PyMuPDF use) and converted to pdf-lib's y via `height - top`
// inside fillIndemnityBondPdf.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

export interface IndemnityFillInput {
  customerName:     string
  aadhaarNumber?:   string | null
  passportNumber?:  string | null
  licenceNumber?:   string | null
  bondDate:         string   // pre-formatted display string, e.g. "27 July 2026"
  bondPlace:        string
  /** Raw PNG bytes of the customer's drawn signature (transparent background). */
  signaturePng?:    Uint8Array | null
  /**
   * Raw PNG bytes of the customer's signature against the dedicated
   * "Alcohol is strictly prohibited in your baggage" declaration box near
   * the bottom of the template — a separate, mandatory signature distinct
   * from the main one above.
   */
  alcoholSignaturePng?: Uint8Array | null
}

// Measured field positions — { x, top } where `top` is distance from the
// top of the page (matches pdfplumber/PyMuPDF convention used when these
// were measured against the real template). Re-verified 2026-07-28 by
// re-extracting word/line/image positions directly from
// public/legal/indemnity-bond-template.pdf with pdfplumber + PyMuPDF after
// a report that the signature was overlapping the suitcase graphic in the
// final PDF — see the maxWidth note on `signature` below.
const FIELDS = {
  customerName:  { x: 36,  top: 150.1 },
  aadhaar:       { x: 407, top: 150.1 },
  passport:      { x: 97,  top: 164.4 },
  licence:       { x: 283, top: 164.4 },
  date:          { x: 60,  top: 714.1 },
  place:         { x: 65,  top: 743.5 },
  // Signature sits on a short ruled line below the "Signature:" label, not
  // beside it — the actual ruled line (from the template's own vector
  // drawings) runs x:26.4-137.5, top:635.96. The suitcase/checklist
  // illustration's bounding box starts at x:115.3, so maxWidth is capped
  // at 80 (30+80=110) rather than the line's full width, leaving a safe
  // ~5pt margin before the image — previously maxWidth:100 (30 to 130)
  // reached 15pt into the image's bounding box, which is what caused the
  // reported overlap for wider signatures.
  signature:     { x: 30,  top: 631.96, maxWidth: 80, maxHeight: 28 },
  // The template has its own dedicated signature cell for this specific
  // declaration — a red-bordered box at the bottom of the page, right half
  // labelled "Signature" (placeholder text), right of a vertical divider
  // at x:489.1. Cell interior: x:489.1-566.9, top:753.9-776.8.
  alcoholSignature: { x: 493, top: 774, maxWidth: 70, maxHeight: 16 },
} as const

const TEMPLATE_PATH = path.join(process.cwd(), 'public', 'legal', 'indemnity-bond-template.pdf')

/**
 * Loads the original bond template and overlays the customer's details +
 * signature onto it, returning the final signed PDF as bytes. Never mutates
 * or re-lays-out the source document — only draws additional content on top
 * of the existing page in the blank spaces the template already provides.
 */
export async function fillIndemnityBondPdf(input: IndemnityFillInput): Promise<Uint8Array> {
  const templateBytes = fs.readFileSync(TEMPLATE_PATH)
  const pdfDoc = await PDFDocument.load(templateBytes)
  const page = pdfDoc.getPages()[0]
  const { height } = page.getSize()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const ink = rgb(0.06, 0.06, 0.45) // dark blue-black, reads as "filled in ink" against the printed black text

  function drawField(text: string | null | undefined, field: { x: number; top: number }, size = 9) {
    const value = (text ?? '').trim()
    if (!value) return
    page.drawText(value, {
      x: field.x,
      y: height - field.top,
      size,
      font,
      color: ink,
    })
  }

  drawField(input.customerName, FIELDS.customerName, 10)
  drawField(input.aadhaarNumber, FIELDS.aadhaar)
  drawField(input.passportNumber, FIELDS.passport)
  drawField(input.licenceNumber, FIELDS.licence)
  drawField(input.bondDate, FIELDS.date)
  drawField(input.bondPlace, FIELDS.place)

  // Scales the (mostly-transparent) signature canvas image down to fit
  // within its target box without distortion, then draws it anchored so
  // its BOTTOM edge sits at `field.top` (same convention as drawField's
  // baseline) — never larger than maxWidth/maxHeight, never upscaled
  // (capped at natural size via the trailing `1`).
  async function drawSignature(
    png: Uint8Array | null | undefined,
    field: { x: number; top: number; maxWidth: number; maxHeight: number },
  ) {
    if (!png || png.length === 0) return
    const sigImage = await pdfDoc.embedPng(png)
    const natural = sigImage.scale(1)
    const scale = Math.min(field.maxWidth / natural.width, field.maxHeight / natural.height, 1)
    page.drawImage(sigImage, {
      x: field.x,
      y: height - field.top,
      width: natural.width * scale,
      height: natural.height * scale,
    })
  }

  await drawSignature(input.signaturePng, FIELDS.signature)
  await drawSignature(input.alcoholSignaturePng, FIELDS.alcoholSignature)

  return pdfDoc.save()
}

/** Reads the blank template bytes as-is (e.g. for a "preview before signing" view). */
export function readIndemnityTemplateBytes(): Buffer {
  return fs.readFileSync(TEMPLATE_PATH)
}
