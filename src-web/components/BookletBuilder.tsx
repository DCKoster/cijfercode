import { useRef, useState } from "react";
import { requestPuzzle } from "../generator/client";
import { normalizeTheme, type BookletSpec, type Difficulty, type PuzzleDocument, type Theme } from "../types";

const emptyCounts = (): Record<Difficulty, number> => ({ 1: 1, 2: 1, 3: 1, 4: 1 });

export function BookletBuilder({ initial, onSave, onPrint }: { initial: { spec: BookletSpec; puzzles: PuzzleDocument[] } | null; onSave: (value: { spec: BookletSpec; puzzles: PuzzleDocument[] }) => void; onPrint: (title: string, puzzles: PuzzleDocument[]) => void }) {
  const initialTheme = normalizeTheme(initial?.spec.theme);
  const [title, setTitle] = useState(initial?.spec.title ?? "Mijn cijfercodeboek");
  const [counts, setCounts] = useState<Record<Difficulty, number>>(initial?.spec.counts ?? emptyCounts());
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [requireEveryLetter, setRequireEveryLetter] = useState(initial?.spec.requireEveryLetter ?? false);
  const [includeProperNames, setIncludeProperNames] = useState(initial?.spec.includeProperNames ?? false);
  const [puzzles, setPuzzles] = useState(initial?.puzzles ?? []);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController>();
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  const updateCount = (level: Difficulty, value: number) => setCounts((current) => ({ ...current, [level]: Math.max(0, Math.min(20, Math.floor(value || 0))) }));
  const generate = async () => {
    if (total < 1 || total > 20) { setStatus("Kies in totaal tussen 1 en 20 puzzels."); return; }
    const controller = new AbortController(); abort.current = controller; setBusy(true); setStatus("Voorbereiden…");
    const next: PuzzleDocument[] = [];
    try {
      for (const level of [1, 2, 3, 4] as Difficulty[]) {
        for (let index = 0; index < counts[level]; index += 1) {
          const number = next.length + 1;
          const puzzle = await requestPuzzle(level, { theme, requireEveryLetter, includeProperNames: theme === "general" && includeProperNames, signal: controller.signal, onProgress: (attempt) => setStatus(`Puzzel ${number} van ${total} · poging ${attempt}`) });
          next.push(puzzle);
        }
      }
      const value = { spec: { title: title.trim() || "Mijn cijfercodeboek", counts, theme, requireEveryLetter, includeProperNames: theme === "general" && includeProperNames }, puzzles: next };
      setPuzzles(next); onSave(value); setStatus(`${next.length} puzzels klaar om af te drukken.`);
    } catch (error) {
      setStatus(error instanceof DOMException && error.name === "AbortError" ? "Genereren geannuleerd." : error instanceof Error ? error.message : "Genereren mislukt.");
    } finally { setBusy(false); abort.current = undefined; }
  };

  return <section className="booklet card">
    <p className="eyebrow">A4-puzzelboek</p><h2>Boekje maken</h2>
    <label className="field">Titel van het boekje<input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} disabled={busy} /></label>
    <label className="field">Onderwerp<select value={theme} onChange={(event) => { const next = event.target.value as Theme; setTheme(next); if (next === "animals_familiar") setRequireEveryLetter(false); }} disabled={busy}><option value="general">Geen thema</option><option value="animals_familiar">Bekende dieren</option><option value="animals_all">Alle dieren</option></select></label>
    <div className="booklet-options">
      <label className="check-option" title={theme === "animals_familiar" ? "De lijst met bekende dieren bevat geen Q." : undefined}><input type="checkbox" checked={requireEveryLetter} onChange={(event) => setRequireEveryLetter(event.target.checked)} disabled={busy || theme === "animals_familiar"} />Alle 26 letters gebruiken</label>
      <label className="check-option"><input type="checkbox" checked={includeProperNames} onChange={(event) => setIncludeProperNames(event.target.checked)} disabled={busy || theme !== "general"} />Eigennamen toestaan</label>
    </div>
    <fieldset disabled={busy}><legend>Aantal puzzels per niveau</legend><div className="count-grid">{([1, 2, 3, 4] as Difficulty[]).map((level) => <label key={level}>Niveau {level}<input type="number" min="0" max="20" value={counts[level]} onChange={(event) => updateCount(level, Number(event.target.value))} /></label>)}</div></fieldset>
    <p className={total > 20 ? "notice" : "muted"}>Totaal: {total} van maximaal 20 puzzels. De puzzels worden op niveau gesorteerd; alle antwoorden komen achterin.</p>
    {status && <p role="status" className="status">{status}</p>}
    <div className="actions">{busy ? <button className="secondary" onClick={() => abort.current?.abort()}>Annuleren</button> : <button onClick={generate}>Boekje genereren</button>}{puzzles.length > 0 && !busy && <button className="secondary" onClick={() => onPrint(title, puzzles)}>Afdrukken / PDF</button>}</div>
  </section>;
}
