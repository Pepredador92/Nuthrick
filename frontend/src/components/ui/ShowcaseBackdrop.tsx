import "./ShowcaseBackdrop.css";

/** Shared fixed scenery for the professional showcase and private patient space. */
export function ShowcaseBackdrop() {
  return <div className="showcase-backdrop" aria-hidden="true">
    <span className="showcase-backdrop-arc" />
    <span className="showcase-backdrop-orbit" />
    <span className="showcase-backdrop-light" />
  </div>;
}
