import { Component, type ReactNode } from "react";

type Props = {
  resetKey: string;
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ToolErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <header className="tool-head">
          <h1>This tool could not load</h1>
          <p className="lede">Go back to all tools or pick another item in the sidebar. A refresh also clears it.</p>
        </header>
      );
    }
    return this.props.children;
  }
}
