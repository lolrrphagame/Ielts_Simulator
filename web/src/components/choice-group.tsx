import type { ReactNode } from "react";

export function ChoiceGroup<T extends string>({ legend, options, value, onChange, render, className = "" }: {
  legend: string; options: readonly T[]; value: T; onChange: (value: T) => void; render: (value: T, selected: boolean) => ReactNode; className?: string;
}) {
  return <fieldset className={`choice-group ${className}`}><legend>{legend}</legend><div className="choice-options">{options.map((option) => <label className={`choice ${value === option ? "selected" : ""}`} key={option}><input type="radio" name={legend} value={option} checked={value === option} onChange={() => onChange(option)} /><span className="choice-content">{render(option, value === option)}</span></label>)}</div></fieldset>;
}
