// Display formula from the brief:
//   seconds > 5.0  -> integer ceil  ("12", "11", ..., "6")
//   seconds <= 5.0 -> one decimal   ("5.0", "4.9", ..., "0.0")
export function formatRemaining(ms) {
  const s = ms / 1000;
  if (s > 5.0) {
    return Math.ceil(s).toString();
  }
  return s.toFixed(1);
}
