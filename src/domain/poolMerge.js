function normalizeNames(names) {
  const seen = new Set();
  const normalized = [];

  for (const raw of names) {
    const name = String(raw || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    normalized.push(name);
  }

  return normalized;
}

function mergeCandidateNames(currentPool, candidateNames, maxSize = 5) {
  const nextPool = [...currentPool];
  const added = [];
  const duplicates = [];
  const skippedFull = [];

  for (const name of normalizeNames(candidateNames)) {
    if (nextPool.includes(name)) {
      duplicates.push(name);
      continue;
    }

    if (nextPool.length >= maxSize) {
      skippedFull.push(name);
      continue;
    }

    nextPool.push(name);
    added.push(name);
  }

  return {
    nextPool,
    added,
    duplicates,
    skippedFull
  };
}

module.exports = {
  mergeCandidateNames
};
