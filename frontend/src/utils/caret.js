/**
 * Pixel position of a character offset inside a <textarea>, relative to the
 * textarea's top-left corner (accounting for its scroll). Uses the standard
 * "mirror div" technique: copy the textarea's text styles onto a hidden div
 * and measure where a marker span lands.
 */
const COPIED = [
  "boxSizing", "width", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "fontStyle", "fontVariant",
  "fontWeight", "fontStretch", "fontSize", "lineHeight", "fontFamily", "textAlign", "textTransform",
  "textIndent", "letterSpacing", "wordSpacing", "tabSize",
];

export function caretCoordinates(textarea, position) {
  const div = document.createElement("div");
  const style = getComputedStyle(textarea);
  for (const prop of COPIED) div.style[prop] = style[prop];
  Object.assign(div.style, {
    position: "absolute",
    visibility: "hidden",
    top: "0",
    left: "-9999px",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    overflow: "hidden",
  });
  div.textContent = textarea.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = textarea.value.slice(position) || ".";
  div.appendChild(marker);
  document.body.appendChild(div);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6;
  const coords = {
    top: marker.offsetTop - textarea.scrollTop,
    left: marker.offsetLeft - textarea.scrollLeft,
    height: lineHeight,
    absoluteTop: marker.offsetTop,
  };
  div.remove();
  return coords;
}
