export function getResultShortcutAction({ key, step, isStatsOpen, isDrawing, hasModifier, isInteractiveTarget }) {
  if (step !== 'result' || isStatsOpen || hasModifier) return null;

  const normalizedKey = key.toLowerCase();
  if (normalizedKey === 'z') return 'roster';
  if (normalizedKey === 'x') return 'preferences';
  if (normalizedKey === 'c') return 'copy';
  if (key === 'Enter' && !isDrawing && !isInteractiveTarget) return 'draw';

  return null;
}