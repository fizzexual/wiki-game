interface Props {
  status: string;
  start?: string | null;
  end?: string | null;
  hidden: boolean;
}

export function Loader({ status, start, end, hidden }: Props) {
  return (
    <div
      className={"game-loading" + (hidden ? " fading-out" : "")}
      style={hidden ? { display: "none" } : undefined}
    >
      <svg className="loader-graphic" viewBox="0 0 240 60" width={240} height={60} aria-hidden="true">
        <line x1={30} y1={30} x2={210} y2={30} className="loader-line" />
        <line x1={30} y1={30} x2={210} y2={30} className="loader-dash" />
        <circle cx={30}  cy={30} r={9} className="loader-node start" />
        <circle cx={210} cy={30} r={9} className="loader-node end" />
        <circle r={4} className="loader-traveler">
          <animateMotion
            dur="1.6s"
            repeatCount="indefinite"
            path="M 30 30 L 210 30"
            calcMode="spline"
            keySplines="0.4 0 0.2 1"
            keyTimes="0;1"
          />
        </circle>
      </svg>
      {start && end && (
        <div className="loader-pair">
          <span>{start}</span>
          <span className="arrow">→</span>
          <span>{end}</span>
        </div>
      )}
      <div className="loader-status">{status}</div>
    </div>
  );
}
