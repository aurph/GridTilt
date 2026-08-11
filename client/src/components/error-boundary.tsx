/**
 * Render-error containment. Before this existed, one widget throwing during
 * render unmounted the whole tree and the visitor got a blank page - the
 * NewsTicker calling items.map() on a rate-limit error body was enough to
 * take every route down with it.
 *
 * A boundary turns that into the same designed failure state the data layer
 * already uses (ErrorState), scoped to the thing that actually broke.
 *
 * Two scopes, one component:
 *   <ErrorBoundary label="..."> around a page  - the route area fails alone
 *   <ErrorBoundary silent>     around chrome   - the widget just disappears
 *
 * `resetKey` clears a caught error when it changes, so navigating to another
 * route recovers instead of pinning the visitor to a dead screen.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "@/components/Freshness";

interface Props {
  children: ReactNode;
  /** Shown in the failure state. Ignored when `silent`. */
  label?: string;
  /** Chrome (ticker, footer): drop the subtree rather than show an error. */
  silent?: boolean;
  /** Change this to clear a caught error - typically the current location. */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
  /** mirrors the resetKey the current error was caught under */
  key: unknown;
}

/**
 * Pure state transition, exported so it can be tested without a DOM.
 * React's own getDerivedStateFromProps contract: return null for no change.
 */
export function resetOnKeyChange(props: Props, state: State): State | null {
  if (state.error !== null && props.resetKey !== state.key) {
    return { error: null, key: props.resetKey };
  }
  return null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: undefined };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): State | null {
    return resetOnKeyChange(props, state);
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the stack in the console: a contained error must still be findable.
    console.error("[gridtilt] contained render error", error, info.componentStack);
    this.setState({ key: this.props.resetKey });
  }

  render() {
    if (this.state.error === null) return this.props.children;
    if (this.props.silent) return null;
    return (
      <ErrorState
        label={this.props.label ?? "This section failed to render."}
        onRetry={() => this.setState({ error: null })}
        className="py-16"
      />
    );
  }
}
