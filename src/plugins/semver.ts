/**
 * Minimal zero-dependency semver parser + range satisfier.
 * Supports: exact ("1.2.3"), caret ("^1.2.3"), tilde ("~1.2.3"),
 * comparison operators (">=1.2.3", ">1.2.3", "<=1.2.3", "<1.2.3", "=1.2.3"),
 * and wildcard ("*", "x", "").
 *
 * Deliberately NOT a full semver spec implementation (no build metadata,
 * simplified prerelease handling) — sufficient for plugin dependency
 * declarations of the form used by @lombok-* packages.
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parseVersion(v: string): ParsedVersion {
  const m = VERSION_RE.exec(v.trim());
  if (!m) {
    throw new Error(`Invalid version string: "${v}" (expected semver X.Y.Z)`);
  }
  // Destructured with `!`-free defaults: the regex above guarantees groups
  // 1-3 are present whenever it matches, but `noUncheckedIndexedAccess`
  // still types them as possibly-undefined.
  const [, major = '0', minor = '0', patch = '0', prerelease] = m;
  return {
    major: parseInt(major, 10),
    minor: parseInt(minor, 10),
    patch: parseInt(patch, 10),
    prerelease: prerelease ?? null,
  };
}

/** Returns -1 if a<b, 0 if a===b, 1 if a>b. Numeric segment comparison
 *  (never string/lexicographic) so 2.9.0 correctly sorts before 2.10.0. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  // A version with a prerelease tag has LOWER precedence than the same
  // version without one (e.g. 1.0.0-beta < 1.0.0), per semver spec.
  if (pa.prerelease && !pb.prerelease) return -1;
  if (!pa.prerelease && pb.prerelease) return 1;
  if (pa.prerelease && pb.prerelease) {
    if (pa.prerelease === pb.prerelease) return 0;
    return pa.prerelease < pb.prerelease ? -1 : 1;
  }
  return 0;
}

function caretUpperBound(v: ParsedVersion): ParsedVersion {
  // ^1.2.3 := >=1.2.3 <2.0.0
  // ^0.2.3 := >=0.2.3 <0.3.0   (0.x.y: minor acts as the "breaking" boundary)
  // ^0.0.3 := >=0.0.3 <0.0.4   (0.0.x: patch acts as the "breaking" boundary)
  if (v.major > 0) return { major: v.major + 1, minor: 0, patch: 0, prerelease: null };
  if (v.minor > 0) return { major: 0, minor: v.minor + 1, patch: 0, prerelease: null };
  return { major: 0, minor: 0, patch: v.patch + 1, prerelease: null };
}

function tildeUpperBound(v: ParsedVersion): ParsedVersion {
  // ~1.2.3 := >=1.2.3 <1.3.0
  return { major: v.major, minor: v.minor + 1, patch: 0, prerelease: null };
}

function cmpParsed(a: ParsedVersion, b: ParsedVersion): -1 | 0 | 1 {
  return compareVersions(`${a.major}.${a.minor}.${a.patch}`, `${b.major}.${b.minor}.${b.patch}`);
}

/** Checks whether `version` satisfies `range`. Range may be a single
 *  clause ("^1.0.0") or a space-separated conjunction (">=1.0.0 <2.0.0"). */
export function satisfies(version: string, range: string): boolean {
  const r = range.trim();
  if (r === '' || r === '*' || r.toLowerCase() === 'x') return true;

  // Conjunction of clauses (all must hold), e.g. ">=1.0.0 <2.0.0"
  const clauses = r.split(/\s+/).filter(Boolean);
  if (clauses.length > 1) {
    return clauses.every(clause => satisfies(version, clause));
  }

  const clause = clauses[0] ?? '';
  const v = parseVersion(version);

  if (clause.startsWith('^')) {
    const base = parseVersion(clause.slice(1));
    const upper = caretUpperBound(base);
    return cmpParsed(v, base) >= 0 && cmpParsed(v, upper) < 0;
  }
  if (clause.startsWith('~')) {
    const base = parseVersion(clause.slice(1));
    const upper = tildeUpperBound(base);
    return cmpParsed(v, base) >= 0 && cmpParsed(v, upper) < 0;
  }
  if (clause.startsWith('>=')) return compareVersions(version, clause.slice(2)) >= 0;
  if (clause.startsWith('<=')) return compareVersions(version, clause.slice(2)) <= 0;
  if (clause.startsWith('>')) return compareVersions(version, clause.slice(1)) > 0;
  if (clause.startsWith('<')) return compareVersions(version, clause.slice(1)) < 0;
  if (clause.startsWith('=')) return compareVersions(version, clause.slice(1)) === 0;

  // Bare version: exact match required.
  return compareVersions(version, clause) === 0;
}
