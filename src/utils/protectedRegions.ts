export interface ProtectedRegionAnalysis {
  regions: Map<string, string>;
  warnings: string[];
  hasMarkers: boolean;
}

const startPatterns = [
  /<!--\s*MANUAL_EDIT_START:\s*([A-Za-z0-9._:-]+)\s*-->/g,
  /^\s*#\s*MANUAL_EDIT_START:\s*([A-Za-z0-9._:-]+)\s*$/gm,
];

const endPattern = /(?:<!--\s*MANUAL_EDIT_END:\s*([A-Za-z0-9._:-]+)\s*-->|^\s*#\s*MANUAL_EDIT_END:\s*([A-Za-z0-9._:-]+)\s*$)/gm;

function nextStart(content: string, fromIndex: number) {
  const matches = startPatterns
    .map((pattern) => {
      pattern.lastIndex = fromIndex;
      const match = pattern.exec(content);
      return match ? { match, index: match.index } : undefined;
    })
    .filter((value): value is { match: RegExpExecArray; index: number } => Boolean(value))
    .sort((a, b) => a.index - b.index);

  return matches[0];
}

function nextEnd(content: string, fromIndex: number) {
  endPattern.lastIndex = fromIndex;
  const match = endPattern.exec(content);
  return match ? { match, index: match.index } : undefined;
}

export function analyzeProtectedRegions(fileContent: string): ProtectedRegionAnalysis {
  const regions = new Map<string, string>();
  const warnings: string[] = [];
  let hasMarkers = false;
  let cursor = 0;

  while (cursor < fileContent.length) {
    const start = nextStart(fileContent, cursor);
    if (!start) {
      break;
    }

    hasMarkers = true;
    const regionId = start.match[1];
    const bodyStart = start.match.index + start.match[0].length;

    const end = nextEnd(fileContent, bodyStart);

    if (!end) {
      warnings.push(`Missing MANUAL_EDIT_END for region '${regionId}'`);
      cursor = bodyStart;
      continue;
    }

    const nestedStart = nextStart(fileContent, bodyStart);
    if (nestedStart && nestedStart.index < end.index) {
      throw new Error(`Nested MANUAL_EDIT regions are not supported: '${regionId}'`);
    }

    const endRegionId = end.match[1] ?? end.match[2];
    if (endRegionId !== regionId) {
      warnings.push(`Mismatched MANUAL_EDIT_END for region '${regionId}'`);
      cursor = end.index + end.match[0].length;
      continue;
    }

    const body = fileContent.slice(bodyStart, end.index);
    regions.set(regionId, body);
    cursor = end.index + end.match[0].length;
  }

  return { regions, warnings, hasMarkers };
}

export function extractProtectedRegions(fileContent: string): Map<string, string> {
  return analyzeProtectedRegions(fileContent).regions;
}

export function reapplyProtectedRegions(newContent: string, regions: Map<string, string>): string {
  let result = newContent;

  for (const [regionId, regionContent] of regions.entries()) {
    const escapedRegionId = regionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const htmlPattern = new RegExp(
      `(<!--\\s*MANUAL_EDIT_START:\\s*${escapedRegionId}\\s*-->)([\\s\\S]*?)(<!--\\s*MANUAL_EDIT_END:\\s*${escapedRegionId}\\s*-->)`,
      "g",
    );
    const hashPattern = new RegExp(
      `(^\\s*#\\s*MANUAL_EDIT_START:\\s*${escapedRegionId}\\s*$)([\\s\\S]*?)(^\\s*#\\s*MANUAL_EDIT_END:\\s*${escapedRegionId}\\s*$)`,
      "gm",
    );

    if (htmlPattern.test(result)) {
      result = result.replace(htmlPattern, `$1${regionContent}$3`);
      continue;
    }

    if (hashPattern.test(result)) {
      result = result.replace(hashPattern, `$1${regionContent}$3`);
    }
  }

  return result;
}
