import type { Difficulty } from "../types";

const labels: Record<Difficulty, { level: string; name: string; hintText: string }> = {
  1: { level: "Niveau 1", name: "Makkelijk", hintText: "3 letters" },
  2: { level: "Niveau 2", name: "Gemiddeld", hintText: "2 letters" },
  3: { level: "Niveau 3", name: "Moeilijk", hintText: "1 letter" },
  4: { level: "Niveau 4", name: "Expert", hintText: "geen letters" },
};

export function difficultyName(level: Difficulty): string { return labels[level].name; }

export function DifficultyPicker({ value, onChange, disabled = false }: { value: Difficulty; onChange: (value: Difficulty) => void; disabled?: boolean }) {
  return <fieldset className="difficulty" disabled={disabled}>
    <legend>Kies de moeilijkheid</legend>
    <div className="difficulty-options">
      {([1, 2, 3, 4] as Difficulty[]).map((level) => <label key={level} className={value === level ? "selected" : ""}>
        <input type="radio" name="difficulty" value={level} checked={value === level} onChange={() => onChange(level)} />
        <strong>{labels[level].level}</strong><span>{labels[level].name} · {labels[level].hintText}</span>
      </label>)}
    </div>
  </fieldset>;
}
