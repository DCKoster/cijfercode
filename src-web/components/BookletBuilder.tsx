import { useRef, useState } from "react";
import { requestPuzzle } from "../generator/client";
import { normalizeTheme, themeLabel, type BookletSpec, type BookletThemeSpec, type Difficulty, type PuzzleDocument, type Theme } from "../types";

const THEMES: Theme[] = ["general", "animals_familiar", "animals_all"];
const LEVELS: Difficulty[] = [1, 2, 3, 4];
const emptyCounts = (initial = 0): Record<Difficulty, number> => ({ 1: initial, 2: initial, 3: initial, 4: initial });
const normalizedCounts = (counts?: Partial<Record<Difficulty, number>>): Record<Difficulty, number> => {
  const value = (level: Difficulty) => Math.max(0, Math.min(50, Math.floor(counts?.[level] || 0)));
  return { 1: value(1), 2: value(2), 3: value(3), 4: value(4) };
};

export function normalizeThemeSpecs(spec?: BookletSpec): BookletThemeSpec[] {
  if (spec?.themes?.length) {
    return THEMES.map((theme) => {
      const saved = spec.themes?.find((item) => normalizeTheme(item.theme) === theme);
      return {
        theme,
        counts: normalizedCounts(saved?.counts),
        requireEveryLetter: theme !== "animals_familiar" && Boolean(saved?.requireEveryLetter),
        includeProperNames: theme === "general" && Boolean(saved?.includeProperNames),
      };
    });
  }
  if (spec?.counts) {
    const legacyTheme = normalizeTheme(spec.theme);
    return THEMES.map((theme) => ({
      theme,
      counts: theme === legacyTheme ? normalizedCounts(spec.counts) : emptyCounts(),
      requireEveryLetter: theme === legacyTheme && theme !== "animals_familiar" && Boolean(spec.requireEveryLetter),
      includeProperNames: theme === legacyTheme && theme === "general" && Boolean(spec.includeProperNames),
    }));
  }
  return THEMES.map((theme) => ({
    theme,
    counts: emptyCounts(theme === "general" ? 1 : 0),
    requireEveryLetter: false,
    includeProperNames: false,
  }));
}

export function BookletBuilder({ initial, onSave, onPrint }: { initial: { spec: BookletSpec; puzzles: PuzzleDocument[] } | null; onSave: (value: { spec: BookletSpec; puzzles: PuzzleDocument[] }) => void; onPrint: (title: string, puzzles: PuzzleDocument[]) => void }) {
  const [title, setTitle] = useState(initial?.spec.title ?? "Mijn cijfercodeboek");
  const [themeSpecs, setThemeSpecs] = useState<BookletThemeSpec[]>(() => normalizeThemeSpecs(initial?.spec));
  const [puzzles, setPuzzles] = useState(initial?.puzzles ?? []);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController>();
  const total = themeSpecs.reduce((sum, item) => sum + Object.values(item.counts).reduce((subtotal, value) => subtotal + value, 0), 0);

  const updateTheme = (theme: Theme, update: (current: BookletThemeSpec) => BookletThemeSpec) => {
    setThemeSpecs((current) => current.map((item) => item.theme === theme ? update(item) : item));
  };
  const updateCount = (theme: Theme, level: Difficulty, value: number) => updateTheme(theme, (current) => ({
    ...current,
    counts: { ...current.counts, [level]: Math.max(0, Math.min(50, Math.floor(value || 0))) },
  }));
  const generate = async () => {
    if (total < 1 || total > 50) { setStatus("Kies in totaal tussen 1 en 50 puzzels."); return; }
    const controller = new AbortController(); abort.current = controller; setBusy(true); setStatus("Voorbereiden…");
    const next: PuzzleDocument[] = [];
    try {
      for (const level of LEVELS) {
        for (const options of themeSpecs) {
          for (let index = 0; index < options.counts[level]; index += 1) {
            const number = next.length + 1;
            const puzzle = await requestPuzzle(level, {
              theme: options.theme,
              requireEveryLetter: options.requireEveryLetter,
              includeProperNames: options.includeProperNames,
              signal: controller.signal,
              onProgress: (attempt) => setStatus(`Puzzel ${number} van ${total} · poging ${attempt}`),
            });
            next.push(puzzle);
          }
        }
      }
      const savedTitle = title.trim() || "Mijn cijfercodeboek";
      const value = { spec: { title: savedTitle, themes: themeSpecs }, puzzles: next };
      setPuzzles(next); onSave(value); setStatus(`${next.length} puzzels klaar om af te drukken.`);
    } catch (error) {
      setStatus(error instanceof DOMException && error.name === "AbortError" ? "Genereren geannuleerd." : error instanceof Error ? error.message : "Genereren mislukt.");
    } finally { setBusy(false); abort.current = undefined; }
  };

  return <section className="booklet card">
    <p className="eyebrow">A4-puzzelboek</p><h2>Boekje maken</h2>
    <label className="field">Titel van het boekje<input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} disabled={busy} /></label>
    <fieldset className="theme-matrix" disabled={busy}>
      <legend>Aantal puzzels per thema en niveau</legend>
      <div className="theme-matrix-header" aria-hidden="true"><span>Thema</span>{LEVELS.map((level) => <span key={level}>Niveau {level}</span>)}</div>
      {themeSpecs.map((item) => <div className="theme-count-row" key={item.theme}>
        <h3>{themeLabel(item.theme)}</h3>
        {LEVELS.map((level) => <label key={level}><span>Niveau {level}</span><input aria-label={`${themeLabel(item.theme)}, niveau ${level}`} type="number" min="0" max="50" value={item.counts[level]} onChange={(event) => updateCount(item.theme, level, Number(event.target.value))} /></label>)}
        <div className="theme-options">
          <label className="check-option" title={item.theme === "animals_familiar" ? "De lijst met bekende dieren bevat geen Q." : undefined}><input type="checkbox" checked={item.requireEveryLetter} onChange={(event) => updateTheme(item.theme, (current) => ({ ...current, requireEveryLetter: event.target.checked }))} disabled={item.theme === "animals_familiar"} />Alle 26 letters gebruiken</label>
          <label className="check-option" title={item.theme !== "general" ? "Dierenpuzzels gebruiken uitsluitend diernamen." : undefined}><input type="checkbox" checked={item.includeProperNames} onChange={(event) => updateTheme(item.theme, (current) => ({ ...current, includeProperNames: event.target.checked }))} disabled={item.theme !== "general"} />Eigennamen toestaan</label>
        </div>
      </div>)}
    </fieldset>
    <p className={total > 50 ? "notice" : "muted"}>Totaal: {total} van maximaal 50 puzzels. De puzzels worden op niveau gesorteerd; alle antwoorden komen achterin.</p>
    {status && <p role="status" className="status">{status}</p>}
    <div className="actions">{busy ? <button className="secondary" onClick={() => abort.current?.abort()}>Annuleren</button> : <button onClick={generate}>Boekje genereren</button>}{puzzles.length > 0 && !busy && <button className="secondary" onClick={() => onPrint(title.trim() || "Mijn cijfercodeboek", puzzles)}>Afdrukken / PDF</button>}</div>
  </section>;
}
