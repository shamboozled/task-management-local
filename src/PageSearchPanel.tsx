import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Search, X } from "lucide-react";
import { type Notebook } from "./model";
import {
  matchIntervals,
  pageSearchIndex,
  searchPages,
  searchSnippet,
  searchTerms,
  type SearchMatch,
  type SearchScope,
  type TextCache,
} from "./pageSearch";

type Props = {
  db: Notebook;
  currentPageId: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onQueryChange: () => void;
  onOpenResult: (pageId: string, match: SearchMatch, terms: string[]) => void;
};
function MatchingText({ text, terms }: { text: string; terms: string[] }) {
  const parts: React.ReactNode[] = [];
  let end = 0;
  for (const match of matchIntervals(text, terms)) {
    parts.push(text.slice(end, match.start));
    parts.push(
      <mark key={match.start}>{text.slice(match.start, match.end)}</mark>,
    );
    end = match.end;
  }
  parts.push(text.slice(end));
  return <>{parts}</>;
}
export default function PageSearchPanel({
  db,
  currentPageId,
  inputRef,
  onClose,
  onQueryChange,
  onOpenResult,
}: Props) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>(
    currentPageId ? "current" : "all",
  );
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [subsectionIds, setSubsectionIds] = useState<string[]>([]);
  const cache = useRef<TextCache>(new Map());
  const index = useMemo(
    () => pageSearchIndex(db, cache.current),
    [db.pages, db.customers, db.sections],
  );
  const results = useMemo(
    () =>
      searchPages(index, query, {
        scope,
        currentPageId,
        sectionIds,
        subsectionIds,
      }),
    [index, query, scope, currentPageId, sectionIds, subsectionIds],
  );
  const terms = searchTerms(query);
  const currentPage = db.pages.find((p) => p.id === currentPageId);
  const availableSubs = db.sections.filter(
    (s) => !sectionIds.length || sectionIds.includes(s.customerId),
  );
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    const validSections = sectionIds.filter((id) =>
      db.customers.some((s) => s.id === id),
    );
    setSectionIds(validSections);
    setSubsectionIds((ids) =>
      ids.filter((id) =>
        db.sections.some(
          (s) =>
            s.id === id &&
            (!validSections.length || validSections.includes(s.customerId)),
        ),
      ),
    );
  }, [db.customers, db.sections]);
  const toggleSection = (id: string) => {
    const next = sectionIds.includes(id)
      ? sectionIds.filter((s) => s !== id)
      : [...sectionIds, id];
    setSectionIds(next);
    setSubsectionIds((ids) =>
      ids.filter((id) =>
        db.sections.some(
          (s) => s.id === id && (!next.length || next.includes(s.customerId)),
        ),
      ),
    );
  };
  const count = results.reduce((n, page) => n + page.matches.length, 0);
  return (
    <aside
      className="page-search-panel"
      aria-label="Page search"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="page-search-heading">
        <h2>
          <Search size={18} />
          Search pages
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close page search"
          title="Close search (Esc)"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <label className="page-search-field">
        Search text
        <input
          ref={inputRef}
          type="search"
          aria-label="Search page text"
          placeholder={'Words or "an exact phrase"…'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onQueryChange();
          }}
        />
      </label>
      <p className="page-search-hint">
        Match all words in any order. Use double quotes for an exact phrase.
      </p>
      <label className="page-search-field">
        Search scope
        <select
          aria-label="Page search scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as SearchScope)}
        >
          <option value="current" disabled={!currentPage}>
            Current page
          </option>
          <option value="all">All pages</option>
          <option value="selected">Selected sections/subsections</option>
        </select>
      </label>
      {scope === "current" && (
        <p className="page-search-hint">
          {currentPage
            ? `Searching ${currentPage.title} only, excluding subpages.`
            : "Open a notes page or choose another scope."}
        </p>
      )}
      {scope === "selected" && (
        <div className="page-search-filters">
          <fieldset>
            <legend>Sections</legend>
            <div className="page-search-filter-options">
              {db.customers.map((section) => (
                <label key={section.id}>
                  <input
                    type="checkbox"
                    checked={sectionIds.includes(section.id)}
                    onChange={() => toggleSection(section.id)}
                  />
                  {section.name}
                </label>
              ))}
              {!db.customers.length && <p>No sections yet.</p>}
            </div>
          </fieldset>
          <fieldset>
            <legend>Subsections</legend>
            <div className="page-search-filter-options">
              {db.customers
                .filter((c) => availableSubs.some((s) => s.customerId === c.id))
                .map((section) => (
                  <div
                    className="page-search-subsection-group"
                    key={section.id}
                  >
                    <span>{section.name}</span>
                    {availableSubs
                      .filter((s) => s.customerId === section.id)
                      .map((sub) => (
                        <label key={sub.id}>
                          <input
                            type="checkbox"
                            aria-label={`${sub.name} — ${section.name}`}
                            checked={subsectionIds.includes(sub.id)}
                            onChange={() =>
                              setSubsectionIds((ids) =>
                                ids.includes(sub.id)
                                  ? ids.filter((id) => id !== sub.id)
                                  : [...ids, sub.id],
                              )
                            }
                          />
                          {sub.name}
                        </label>
                      ))}
                  </div>
                ))}
              {!availableSubs.length && <p>No subsections available.</p>}
            </div>
          </fieldset>
          <div className="page-search-filter-footer">
            <span>
              {sectionIds.length || subsectionIds.length
                ? `${sectionIds.length} ${sectionIds.length === 1 ? "section" : "sections"} · ${subsectionIds.length} ${subsectionIds.length === 1 ? "subsection" : "subsections"} selected`
                : "No filters selected: all pages"}
            </span>
            <button
              type="button"
              onClick={() => {
                setSectionIds([]);
                setSubsectionIds([]);
              }}
            >
              Clear filters
            </button>
          </div>
        </div>
      )}
      <div
        className="page-search-results"
        role="region"
        aria-label="Page search results"
      >
        <p className="page-search-count" role="status" aria-live="polite">
          {terms.length
            ? `${count} ${count === 1 ? "match" : "matches"} in ${results.length} ${results.length === 1 ? "page" : "pages"}`
            : "Enter text to search your notes."}
        </p>
        {terms.length > 0 && !results.length && (
          <p className="page-search-empty">
            No matching pages in this scope. Try different text or expand the
            search scope.
          </p>
        )}
        {results.map((page) => (
          <section
            className="page-search-result"
            key={page.pageId}
            data-search-page={page.pageId}
            aria-label={`Matches in ${page.title}`}
          >
            <h3>{page.title}</h3>
            <p className="page-search-path">{page.path.join(" › ")}</p>
            {page.matches.map((match) => (
              <button
                key={
                  match.bulletId === null
                    ? "page-title"
                    : `bullet:${match.bulletId}`
                }
                type="button"
                className="page-search-hit"
                data-search-bullet={match.bulletId ?? "title"}
                onClick={() => onOpenResult(page.pageId, match, terms)}
              >
                {match.bulletId === null && (
                  <span className="page-search-hit-label">Page title</span>
                )}
                <MatchingText
                  text={searchSnippet(match.text, terms)}
                  terms={terms}
                />
              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}
