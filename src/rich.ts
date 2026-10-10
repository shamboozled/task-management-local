const tags = new Set([
  "A",
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "BR",
  "P",
  "DIV",
  "UL",
  "OL",
  "LI",
  "TABLE",
  "THEAD",
  "TBODY",
  "TR",
  "TH",
  "TD",
  "IMG",
  "BLOCKQUOTE",
]);
export function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  function clean(parent: Element) {
    for (const el of Array.from(parent.children)) {
      if (
        [
          "SCRIPT",
          "STYLE",
          "IFRAME",
          "OBJECT",
          "SVG",
          "MATH",
          "FORM",
          "INPUT",
          "BUTTON",
          "META",
          "LINK",
        ].includes(el.tagName)
      ) {
        el.remove();
        continue;
      }
      clean(el);
      if (!tags.has(el.tagName)) {
        el.replaceWith(...el.childNodes);
        continue;
      }
      const href = el.getAttribute("href"),
        src = el.getAttribute("src"),
        alt = el.getAttribute("alt");
      for (const attr of Array.from(el.attributes))
        el.removeAttribute(attr.name);
      if (el.tagName === "A" && href && /^(https?:\/\/|mailto:)/i.test(href)) {
        el.setAttribute("href", href);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
      if (el.tagName === "IMG") {
        if (src && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(src)) {
          el.setAttribute("src", src);
          el.setAttribute("alt", alt ?? "Inserted image");
        } else el.remove();
      }
    }
  }
  clean(doc.body);
  return doc.body.innerHTML;
}
export function plainHtml(text: string) {
  const el = document.createElement("div");
  el.textContent = text;
  const html = el.innerHTML.replace(/\n/g, "<br>");
  return html.replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, (token) => {
    const match = token.replace(/[.,;!?)]+$/, "");
    const suffix = token.slice(match.length);
    const href = match.startsWith("www.") ? "https://" + match : match;
    return `<a href="${href.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">${match}</a>${suffix}`;
  });
}
export function tableHtml(rows: number, cols: number) {
  return (
    "<table><tbody>" +
    Array.from(
      { length: rows },
      () =>
        "<tr>" +
        Array.from({ length: cols }, () => "<td><br></td>").join("") +
        "</tr>",
    ).join("") +
    "</tbody></table><div><br></div>"
  );
}
export async function imageHtml(file: File) {
  if (
    !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type)
  )
    throw Error("Use a PNG, JPEG, GIF, or WebP image.");
  if (file.size > 10 * 1024 * 1024) throw Error("Images must be under 10 MB.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(Error("Could not read image."));
    reader.readAsDataURL(file);
  });
  return `<img src="${data}" alt="Inserted image"><br>`;
}

export function linkify(html: string): string {
  const root = document.createElement("div");
  root.innerHTML = html;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode()))
    if (!node.parentElement?.closest("a")) nodes.push(node as Text);
  for (const text of nodes) {
    const value = text.textContent ?? "";
    const pattern = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
    const matches = Array.from(value.matchAll(pattern));
    if (!matches.length) continue;
    const fragment = document.createDocumentFragment();
    let offset = 0;
    for (const match of matches) {
      const token = match[0].replace(/[.,;!?)]+$/, "");
      fragment.append(
        document.createTextNode(value.slice(offset, match.index)),
      );
      const anchor = document.createElement("a");
      anchor.href = token.startsWith("www.") ? "https://" + token : token;
      anchor.textContent = token;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      fragment.append(anchor);
      offset = match.index! + token.length;
    }
    fragment.append(document.createTextNode(value.slice(offset)));
    text.replaceWith(fragment);
  }
  return root.innerHTML;
}
