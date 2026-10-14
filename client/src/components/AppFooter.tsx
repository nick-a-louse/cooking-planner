import { VERSION } from "../utils/version";

export default function AppFooter() {
  return (
    <footer className="g-footer">
      <div className="wrap">
        <span>Cooking Planner · v{VERSION}</span>
        <span>Self-hosted</span>
      </div>
    </footer>
  );
}
