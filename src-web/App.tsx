import { useCallback, useState } from "react";
import { BookletBuilder } from "./components/BookletBuilder";
import { DifficultyPicker } from "./components/DifficultyPicker";
import { Player, type PlayerState } from "./components/Player";
import { PrintDocument, type PrintJob } from "./components/PrintDocument";
import { requestPuzzle } from "./generator/client";
import { loadStored, migrateLegacyStorage, storeValue } from "./storage";
import { normalizeTheme, type BookletSpec, type Difficulty, type PuzzleDocument, type Theme } from "./types";

type Tab = "play" | "booklet";
interface SavedPlayer { puzzle: PuzzleDocument; state: PlayerState }
interface SavedBooklet { spec: BookletSpec; puzzles: PuzzleDocument[] }

export default function App() {
  migrateLegacyStorage();
  const storedPlayer = loadStored<SavedPlayer | null>("player", null);
  const savedPlayer = storedPlayer ? { ...storedPlayer, puzzle: { ...storedPlayer.puzzle, theme: normalizeTheme(storedPlayer.puzzle.theme) } } : null;
  const [tab, setTab] = useState<Tab>("play");
  const [difficulty, setDifficulty] = useState<Difficulty>(1);
  const [theme, setTheme] = useState<Theme>("general");
  const [requireEveryLetter, setRequireEveryLetter] = useState(false);
  const [includeProperNames, setIncludeProperNames] = useState(false);
  const [puzzle, setPuzzle] = useState<PuzzleDocument | null>(savedPlayer?.puzzle ?? null);
  const [playerState, setPlayerState] = useState<PlayerState | undefined>(savedPlayer?.state);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const savedBooklet = loadStored<SavedBooklet | null>("booklet", null);

  const generate = async () => {
    setBusy(true); setStatus("Woordenlijst laden…");
    try {
      const next = await requestPuzzle(difficulty, { theme, requireEveryLetter, includeProperNames: theme === "general" && includeProperNames, onProgress: (attempt) => setStatus(`Puzzel maken · poging ${attempt}`) });
      const state = { puzzleId: next.puzzleId, mapping: { ...next.givens } };
      setPuzzle(next); setPlayerState(state); storeValue("player", { puzzle: next, state }); setStatus("");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Genereren mislukt."); }
    finally { setBusy(false); }
  };
  const savePlayer = useCallback((state: PlayerState) => {
    setPlayerState(state);
    setPuzzle((current) => { if (current) storeValue("player", { puzzle: current, state }); return current; });
  }, []);
  const print = (job: PrintJob) => { setPrintJob(job); window.setTimeout(() => window.print(), 50); };

  return <>
    <div className="screen-app">
      <header className="site-header"><a href="#" className="brand" onClick={(event) => { event.preventDefault(); setTab("play"); }}>Cijfercode<span>Nederlandse woordpuzzels</span></a><nav aria-label="Hoofdnavigatie"><button className={tab === "play" ? "active" : ""} onClick={() => setTab("play")}>Spelen</button><button className={tab === "booklet" ? "active" : ""} onClick={() => setTab("booklet")}>Boekje maken</button></nav></header>
      <main>
        {tab === "play" ? <>
          <section className="hero"><p className="eyebrow">Elke letter heeft een nummer</p><h1>Kraak de cijfercode</h1><p>Kies een niveau en vul de Nederlandse woorden in. Dezelfde cijfers zijn altijd dezelfde letters.</p></section>
          <section className="generator card">
            <DifficultyPicker value={difficulty} onChange={setDifficulty} disabled={busy} />
            <div className="generation-settings">
              <label className="topic-picker">Onderwerp<select value={theme} onChange={(event) => { const next = event.target.value as Theme; setTheme(next); if (next === "animals_familiar") setRequireEveryLetter(false); if (next !== "general") setIncludeProperNames(false); }} disabled={busy}><option value="general">Geen thema</option><option value="animals_familiar">Bekende dieren</option><option value="animals_all">Alle dieren</option></select></label>
              <label className="check-option" title={theme === "animals_familiar" ? "De lijst met bekende dieren bevat geen Q." : undefined}><input type="checkbox" checked={requireEveryLetter} onChange={(event) => setRequireEveryLetter(event.target.checked)} disabled={busy || theme === "animals_familiar"} />Alle 26 letters gebruiken</label>
              <label className="check-option" title={theme !== "general" ? "Dierenpuzzels gebruiken uitsluitend diernamen." : undefined}><input type="checkbox" checked={includeProperNames} onChange={(event) => setIncludeProperNames(event.target.checked)} disabled={busy || theme !== "general"} />Eigennamen toestaan</label>
            </div>
            <button onClick={generate} disabled={busy}>{busy ? "Bezig met genereren…" : "Nieuwe puzzel"}</button>{status && <p className="status" role="status">{status}</p>}
          </section>
          {puzzle && <Player key={puzzle.puzzleId} puzzle={puzzle} saved={playerState} onSave={savePlayer} onPrint={() => print({ puzzles: [puzzle], cover: false })} />}
        </> : <BookletBuilder initial={savedBooklet} onSave={(value) => storeValue("booklet", value)} onPrint={(title, puzzles) => print({ title, puzzles, cover: true })} />}
      </main>
      <footer className="site-footer">Woordenlijst: Stichting OpenTaal · <a href="https://github.com/DCKoster/cijfercode">Broncode en licenties</a></footer>
    </div>
    <PrintDocument job={printJob} />
  </>;
}
