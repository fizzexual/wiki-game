import { wikiUrl } from "../lib/format";

interface Props {
  titles: string[];
}

export function PathDisplay({ titles }: Props) {
  return (
    <ol className="path-list">
      {titles.map((t, i) => (
        <li key={i} style={{ animationDelay: `${i * 120}ms` }}>
          <span className="step">{i + 1}</span>
          <a href={wikiUrl(t)} target="_blank" rel="noopener">{t}</a>
        </li>
      ))}
    </ol>
  );
}
