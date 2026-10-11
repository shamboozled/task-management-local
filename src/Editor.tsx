import { useCallback, useLayoutEffect, useRef } from "react";
import { openLink } from "./links";
import { sanitize, plainHtml, imageHtml, linkify } from "./rich";
import { insertHtml } from "./selection";
type Props = {
  html: string;
  onChange: (html: string) => void;
  onFocus?: (el: HTMLDivElement) => void;
  onKey?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  readOnly?: boolean;
  label: string;
  inherited?: boolean;
  onCommit?: (html: string) => void;
  onPasteBullets?: (event: React.ClipboardEvent<HTMLDivElement>) => boolean;
};
export default function Editor({
  html,
  onChange,
  onFocus,
  onKey,
  readOnly,
  label,
  inherited = false,
  onCommit,
  onPasteBullets,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(html);
  const initial = useRef(html);
  const pointerFocus = useRef(false);
  const bind = useCallback((el: HTMLDivElement | null) => {
    if (el && el !== ref.current) el.innerHTML = sanitize(initial.current);
    ref.current = el;
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== html && html !== last.current) {
      const focused = el.contains(document.getSelection()?.anchorNode ?? null);
      el.innerHTML = sanitize(html);
      if (focused) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
    last.current = html;
  }, [html]);
  const change = () => {
    if (ref.current) {
      last.current = ref.current.innerHTML;
      onChange(ref.current.innerHTML);
    }
  };
  return (
    <div
      ref={bind}
      className="rich-editor"
      contentEditable={inherited ? undefined : !readOnly}
      tabIndex={inherited ? -1 : undefined}
      suppressContentEditableWarning
      role={readOnly ? undefined : "textbox"}
      aria-label={label}
      data-placeholder="Write a note…"
      onInput={change}
      onBlur={() => {
        if (ref.current) {
          const clean = linkify(sanitize(ref.current.innerHTML));
          if (clean !== ref.current.innerHTML) ref.current.innerHTML = clean;
          last.current = clean;
          onChange(clean);
          onCommit?.(clean);
        }
      }}
      onFocus={() => {
        if (ref.current) {
          const s = window.getSelection();
          if (
            inherited &&
            !pointerFocus.current &&
            !ref.current.contains(s?.focusNode ?? null)
          ) {
            const range = document.createRange();
            range.selectNodeContents(ref.current);
            range.collapse(false);
            s?.removeAllRanges();
            s?.addRange(range);
          }
          onFocus?.(ref.current);
        }
        pointerFocus.current = false;
      }}
      onMouseDown={() => {
        pointerFocus.current = true;
      }}
      onKeyDown={inherited ? undefined : onKey}
      onClick={(e) => {
        const link = (e.target as Element).closest("a");
        if (link) {
          e.preventDefault();
          const href = link.getAttribute("href");
          if (href)
            void openLink(href).catch((error) => window.alert(error.message));
        }
      }}
      onPaste={async (e) => {
        if (readOnly) return;
        if (inherited) return;
        if (onPasteBullets?.(e)) return;
        e.preventDefault();
        const clipboard = e.clipboardData;
        const files = Array.from(clipboard.files);
        try {
          let content = "";
          if (files.length) {
            for (const file of files) content += await imageHtml(file);
            ref.current?.focus();
          } else
            content = clipboard.getData("text/html")
              ? sanitize(clipboard.getData("text/html"))
              : plainHtml(clipboard.getData("text/plain"));
          if (ref.current) insertHtml(ref.current, content);
          change();
        } catch (error) {
          window.alert((error as Error).message);
        }
      }}
    />
  );
}
