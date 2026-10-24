interface Props {
  choices: string[]
  disabled: boolean
  selectedIndex?: number | null
  /** When set, the answer is revealed: correct/wrong states are shown. */
  correctIndex?: number | null
  /** Optional: how many players picked each choice (live reveal). */
  counts?: number[]
  onPick?: (index: number) => void
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export function ChoiceList({ choices, disabled, selectedIndex = null, correctIndex = null, counts, onPick }: Props) {
  const revealed = correctIndex !== null
  return (
    <div className="choices" role="group" aria-label="Answer choices">
      {choices.map((text, i) => {
        const isCorrect = revealed && i === correctIndex
        const isWrongPick = revealed && i === selectedIndex && i !== correctIndex
        const isSelected = !revealed && i === selectedIndex
        const cls = ['choice', isCorrect ? 'correct' : '', isWrongPick ? 'wrong' : '', isSelected ? 'selected' : ''].join(' ').trim()
        return (
          <button key={i} type="button" className={cls} disabled={disabled} aria-pressed={i === selectedIndex} onClick={() => onPick?.(i)}>
            <span className="letter" aria-hidden="true">{LETTERS[i]}</span>
            <span>{text}</span>
            {counts && <span className="bar">{counts[i]} {counts[i] === 1 ? 'player' : 'players'}</span>}
            {isCorrect && <span className="mark">✓ Correct</span>}
            {isWrongPick && <span className="mark">✗ Your answer</span>}
            {isSelected && <span className="mark">Selected</span>}
          </button>
        )
      })}
    </div>
  )
}
