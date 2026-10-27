import type { Question, Responses } from "@/lib/listening/schema";

export function QuestionInput({
  question,
  responses,
  disabled,
  onChange,
}: {
  question: Question;
  responses: Responses;
  disabled: boolean;
  onChange: (values: Responses) => void;
}) {
  const n = question.numbers[0];
  if (question.kind === "multiple") {
    const selected = question.numbers
      .map((number) => responses[number]?.toUpperCase())
      .filter(Boolean);
    return (
      <fieldset disabled={disabled} className="answer-options">
        <legend>
          Answers for questions {question.numbers.join(" and ")} (choose{" "}
          {question.limit})
        </legend>
        {question.options.map((option) => (
          <label key={option}>
            <input
              type="checkbox"
              checked={selected.includes(option)}
              disabled={
                !selected.includes(option) && selected.length >= question.limit
              }
              onChange={(event) => {
                const next = event.target.checked
                  ? [...selected, option]
                  : selected.filter((value) => value !== option);
                onChange(
                  Object.fromEntries(
                    question.numbers.map((number, index) => [
                      number,
                      next[index] ?? "",
                    ]),
                  ),
                );
              }}
            />
            {option}
          </label>
        ))}
      </fieldset>
    );
  }
  if (question.kind === "single")
    return (
      <fieldset disabled={disabled} className="answer-options">
        <legend>Answer for question {n}</legend>
        {question.options.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={`answer-${n}`}
              value={option}
              checked={responses[n]?.toUpperCase() === option}
              onChange={() => onChange({ [n]: option })}
            />
            {option}
          </label>
        ))}
        <button
          type="button"
          className="text-button"
          onClick={() => onChange({ [n]: "" })}
        >
          Clear
        </button>
      </fieldset>
    );
  if (question.kind === "matching")
    return (
      <label className="answer-label">
        Answer for question {n}
        <select
          disabled={disabled}
          value={responses[n] ?? ""}
          onChange={(event) => onChange({ [n]: event.target.value })}
        >
          <option value="">Choose a letter</option>
          {question.options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
    );
  return (
    <label className="answer-label">
      Answer for question {n}
      <input
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        maxLength={200}
        value={responses[n] ?? ""}
        onChange={(event) => onChange({ [n]: event.target.value })}
      />
    </label>
  );
}
