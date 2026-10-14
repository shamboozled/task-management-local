import { useLayoutEffect, useRef, useState } from "react";

export function TaskContextMenu({
  x,
  y,
  count,
  onAssign,
  onUnassign,
  onCopy,
  onClose,
}: {
  x: number;
  y: number;
  count: number;
  onAssign: () => void;
  onUnassign: () => void;
  onCopy: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = ref.current!;
    const box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - box.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - box.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button")?.focus();
  }, [x, y]);
  return (
    <div
      ref={ref}
      className="task-context-menu"
      role="menu"
      aria-label="Selected task actions"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        const buttons = [
          ...ref.current!.querySelectorAll<HTMLButtonElement>("button"),
        ];
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          buttons[
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (index + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                  buttons.length
          ].focus();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="task-context-count">{count} selected</div>
      <button role="menuitem" onClick={onAssign}>
        Assign date…
      </button>
      <button role="menuitem" onClick={onUnassign}>
        Unassign selected tasks
      </button>
      <button role="menuitem" onClick={onCopy}>
        Copy selected tasks
      </button>
    </div>
  );
}

const localISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function TaskDateDialog({
  count,
  initialDate,
  onAssign,
  onClose,
}: {
  count: number;
  initialDate: string | null;
  onAssign: (date: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialDate ?? "");
  const [month, setMonth] = useState(() =>
    initialDate
      ? new Date(+initialDate.slice(0, 4), +initialDate.slice(5, 7) - 1, 1)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const ref = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    ref.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);
  const lastDay = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  return (
    <div
      className="modal-backdrop task-date-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        ref={ref}
        className="modal task-date-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Assign date to selected tasks"
        onSubmit={(e) => {
          e.preventDefault();
          if (value) onAssign(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
          if (e.key !== "Tab") return;
          const controls = [
            ...ref.current!.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input",
            ),
          ];
          const first = controls[0],
            last = controls.at(-1)!;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <h2>Assign date</h2>
        <p>
          {count} selected task{count === 1 ? "" : "s"}
        </p>
        <label>
          Due date
          <input
            type="date"
            aria-label="Selected tasks due date"
            required
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (e.target.value)
                setMonth(
                  new Date(
                    +e.target.value.slice(0, 4),
                    +e.target.value.slice(5, 7) - 1,
                    1,
                  ),
                );
            }}
          />
        </label>
        <div className="task-calendar-heading">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            ‹
          </button>
          <span aria-live="polite">
            {month.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            ›
          </button>
        </div>
        <div className="task-calendar" role="group" aria-label="Calendar">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <span key={day} className="task-calendar-weekday">
              {day}
            </span>
          ))}
          {Array.from({ length: month.getDay() }, (_, n) => (
            <span key={`blank-${n}`} />
          ))}
          {Array.from({ length: lastDay }, (_, n) => {
            const date = new Date(month.getFullYear(), month.getMonth(), n + 1),
              iso = localISO(date);
            return (
              <button
                key={iso}
                type="button"
                aria-label={date.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                aria-pressed={value === iso}
                aria-current={iso === localISO(new Date()) ? "date" : undefined}
                onClick={() => onAssign(iso)}
              >
                {n + 1}
              </button>
            );
          })}
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            Assign date
          </button>
        </div>
      </form>
    </div>
  );
}
