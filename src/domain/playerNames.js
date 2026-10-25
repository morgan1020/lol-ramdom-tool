// Display only. Never use these labels as storage keys or client account identifiers.
export function displayPlayerName(name) {
  const text = String(name || '');
  const separator = text.lastIndexOf('#');
  return separator > 0 && separator < text.length - 1 ? text.slice(0, separator) : text;
}

export function createPlayerLabels(names) {
  const counts = new Map();
  for (const name of names) {
    const display = displayPlayerName(name);
    counts.set(display, (counts.get(display) || 0) + 1);
  }
  const seen = new Map();
  return Object.fromEntries(names.map((name) => {
    const display = displayPlayerName(name);
    const number = (seen.get(display) || 0) + 1;
    seen.set(display, number);
    return [name, counts.get(display) > 1 ? `${display} · ${number}` : display];
  }));
}
