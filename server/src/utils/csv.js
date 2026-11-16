// Minimal, safe CSV writer (RFC 4180 quoting, UTF-8 BOM so Excel reads accents/₹ correctly).
export const BOM = '﻿';

/**
 * Spreadsheet formula injection: a text cell starting with = + - @ (or tab/CR) can run as a formula when the
 * file is opened in Excel/Sheets. Applicants control names and similar fields, so prefix such text with a quote.
 * Real numbers are written as-is.
 */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvRow = (cells) => `${cells.map(csvCell).join(',')}\r\n`;
