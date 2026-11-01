// A minimal semver range evaluator, so the compatibility test can assert the
// range's BEHAVIOUR without taking a dependency.
//
// It implements the part of node-semver this recipe's ranges use:
//   - `||` alternatives, each a space-separated list of comparators
//   - the operators `>=`, `>`, `<=`, `<`, `=`
//   - the prerelease rule: a prerelease version satisfies a comparator set
//     only if some comparator in that set names a prerelease of the SAME
//     major.minor.patch tuple
//   - the `includePrerelease` option, which relaxes that rule
//
// The behaviour was cross-checked against node-semver 7.8.5 (npm's bundled
// copy) over the version and range set the tests use; see the note in
// index.test.mjs.

function parseVersion(raw) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(
    String(raw).trim()
  );
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split(".") : [],
    build: m[5] || "",
  };
}

// Compare two prerelease identifier lists per semver precedence.
function comparePrerelease(a, b) {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1; // a release outranks a prerelease
  if (b.length === 0) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else if (xn !== yn) {
      return xn ? -1 : 1; // numeric identifiers rank lower than alphanumeric
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

export function compareVersions(a, b) {
  const va = typeof a === "string" ? parseVersion(a) : a;
  const vb = typeof b === "string" ? parseVersion(b) : b;
  if (!va || !vb) throw new Error(`unparseable version: ${a} / ${b}`);
  for (const key of ["major", "minor", "patch"]) {
    if (va[key] !== vb[key]) return va[key] < vb[key] ? -1 : 1;
  }
  return comparePrerelease(va.prerelease, vb.prerelease);
}

const OPERATORS = { ">=": 1, ">": 1, "<=": -1, "<": -1, "=": 0 };

// Parse one range term into the comparator(s) it stands for.
//
// `^X.Y.Z` expands to a PAIR: `>=X.Y.Z` and `<(X+1).0.0`, where the upper
// bound carries a `-0` prerelease tag when the lower bound does. That tag
// is what keeps the bound exclusive of the next minor's releases as well
// as of its prereleases.
function parseComparators(raw) {
  const text = String(raw).trim();
  const caret = /^\^(.+)$/.exec(text);
  if (caret) {
    const lower = parseVersion(caret[1]);
    if (!lower) return [];
    // The caret allows only patch-level changes inside a 0.x line, and only
    // minor-level changes inside a 0.0.x line.
    let upper;
    if (lower.major > 0) {
      upper = { major: lower.major + 1, minor: 0, patch: 0 };
    } else if (lower.minor > 0) {
      upper = { major: 0, minor: lower.minor + 1, patch: 0 };
    } else {
      upper = { major: 0, minor: 0, patch: lower.patch + 1 };
    }
    upper.prerelease = lower.prerelease.length ? ["0"] : [];
    upper.build = "";
    return [
      { op: ">=", version: lower },
      { op: "<", version: upper },
    ];
  }
  const m = /^(>=|<=|>|<|=)?\s*(.+)$/.exec(text);
  if (!m) return [];
  const op = m[1] || "=";
  const version = parseVersion(m[2]);
  if (!version || !(op in OPERATORS)) return [];
  return [{ op, version }];
}

// Does `version` satisfy a single comparator?
function satisfiesComparator(version, comparator) {
  const cmp = compareVersions(version, comparator.version);
  switch (comparator.op) {
    case ">=":
      return cmp >= 0;
    case ">":
      return cmp > 0;
    case "<=":
      return cmp <= 0;
    case "<":
      return cmp < 0;
    default:
      return cmp === 0;
  }
}

// Does `version` satisfy a space-separated list of comparators?
function satisfiesComparatorSet(version, comparators, includePrerelease) {
  if (!comparators.length) return false;
  for (const comparator of comparators) {
    if (!satisfiesComparator(version, comparator)) return false;
  }
  // The prerelease rule: a prerelease version is only allowed to satisfy a
  // set if the set itself names a prerelease of the same tuple. With
  // includePrerelease on, the rule does not apply.
  if (!includePrerelease) {
    const v = parseVersion(version);
    if (v && v.prerelease.length) {
      const named = comparators.some((c) => {
        const cv = c.version;
        return (
          cv.prerelease.length > 0 &&
          cv.major === v.major &&
          cv.minor === v.minor &&
          cv.patch === v.patch
        );
      });
      if (!named) return false;
    }
  }
  return true;
}

/**
 * Does `version` satisfy `range`?
 *
 * @param {string} version
 * @param {string} range
 * @param {{includePrerelease?: boolean}} [options]
 */
export function satisfies(version, range, options = {}) {
  const includePrerelease = Boolean(options.includePrerelease);
  const alternatives = String(range)
    .split("||")
    .map((part) =>
      part
        .trim()
        .split(/\s+/)
        .flatMap(parseComparators)
    );
  return alternatives.some((set) => satisfiesComparatorSet(version, set, includePrerelease));
}
