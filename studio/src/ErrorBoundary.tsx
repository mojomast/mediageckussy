import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Studio render failed", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="dashboard-layout">
          <section className="panel error-panel">
            <div className="eyebrow">Studio Error</div>
            <h1>Something went wrong in the Studio UI.</h1>
            <p className="muted">Refresh the page to recover. Your project files in `output/` were not changed by this render error.</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
