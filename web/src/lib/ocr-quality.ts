// Detection is conservative: flag uncertainty, never guess punctuation or numbers.
export function ocrQualityWarnings(text: string): string[] {
  const warnings: string[] = [];
  if (text !== text.normalize("NFC"))
    warnings.push(
      "Non-NFC Unicode; check offsets before normalizing existing annotations",
    );
  if (/\uFFFD|Ã.|Â.|â€/.test(text))
    warnings.push("Possible UTF-8 decoding artifact");
  if (/\p{L}\?\p{L}|\b[A-H]\?[A-H]\b|\b\d+\?\d+\b|\?[^?\n]{1,60}\?/u.test(text))
    warnings.push(
      "Ambiguous question mark: compare with source, do not replace globally",
    );
  if (/^\s*\d{1,3}\s*$/.test(text))
    warnings.push("Possible page number; remove only after source review");
  return warnings;
}
