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
}

// Measured field positions — { x, top } where `top` is distance from the
// top of the page (matches pdfplumber/PyMuPDF convention used when these
// were measured against the real template).
const FIELDS = {
  customerName:  { x: 36,  top: 150.1 },
  aadhaar:       { x: 407, top: 150.1 },
  passport:      { x: 97,  top: 164.4 },
  licence:       { x: 283, top: 164.4 },
  date:          { x: 60,  top: 714.1 },
  place:         { x: 65,  top: 743.5 },
  // Signature sits on a short ruled line (~107pt wide) below the
  // "Signature:" label, not beside it — confirmed by extracting the
  // template's actual vector line positions, not guessed from the label.
  signature:     { x: 30,  top: 631.96, maxWidth: 100, maxHeight: 28 },
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

  if (input.signaturePng && input.signaturePng.length > 0) {
    const sigImage = await pdfDoc.embedPng(input.signaturePng)
    const natural = sigImage.scale(1)
    const { maxWidth, maxHeight } = FIELDS.signature
    const scale = Math.min(maxWidth / natural.width, maxHeight / natural.height, 1)
    page.drawImage(sigImage, {
      x: FIELDS.signature.x,
      y: height - FIELDS.signature.top,
      width: natural.width * scale,
      height: natural.height * scale,
    })
  }

  return pdfDoc.save()
}

/** Reads the blank template bytes as-is (e.g. for a "preview before signing" view). */
export function readIndemnityTemplateBytes(): Buffer {
  return fs.readFileSync(TEMPLATE_PATH)
}
