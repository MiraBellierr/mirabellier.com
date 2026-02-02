export function tagToColor(tag: string, darkMode: boolean) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h << 5) - h + tag.charCodeAt(i);
    h |= 0;
  }
  const hue = Math.abs(h) % 360;
  if (darkMode) {
    // in dark mode, use a light pill with dark text for contrast
    const bg = `hsl(${hue} 70% 92%)`;
    const color = "#000000";
    return { bg, color };
  }
  const bg = `hsl(${hue} 70% 92%)`;
  const color = `hsl(${hue} 60% 20%)`;
  return { bg, color };
}
