function parseCandidateNames(rawText) {
  return String(rawText || '')
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

module.exports = {
  parseCandidateNames
};
