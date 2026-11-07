/** Deterministic, synthetic wallpaper; no private/network image is needed. */
export function glassTexture(kind: "light" | "dark" | "complex" = "complex") {
  const colors = kind === "light" ? ["#e7eaf2", "#88b4d6", "#fff5ce", "#8293c7"]
    : kind === "dark" ? ["#152035", "#3b5277", "#719199", "#482e58"]
    : ["#bf1830", "#ffbd3e", "#fff0ca", "#47235d"];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1000" viewBox="0 0 1440 1000">
    <defs><pattern id="detail" width="32" height="32" patternUnits="userSpaceOnUse">
      <path fill="${colors[0]}" d="M0 0h32v32H0z"/>
      <path fill="${colors[1]}" d="M0 0h16v16H0zM16 16h16v16H16z"/>
      <path stroke="${colors[2]}" stroke-width="2" d="M0 8h32M8 0v32"/>
    </pattern></defs><path fill="url(#detail)" d="M0 0h1440v1000H0z"/>
    <circle cx="200" cy="200" r="130" fill="${colors[3]}" fill-opacity=".5"/>
    <circle cx="1250" cy="780" r="190" fill="${colors[3]}" fill-opacity=".55"/>
    <path d="M20 900 1350 90" stroke="${colors[2]}" stroke-width="55" stroke-opacity=".3"/>
  </svg>`;
}
