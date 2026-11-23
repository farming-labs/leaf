import { attrs, handlers } from "@ui-sdk/core/renderer";
import { toggle } from "@ui-sdk/core/toggle";
import { useFarmStore } from "farm-leaf/bindings";
import { type Children, useMemo } from "leaf";

type ToggleProps = { id: string; defaultPressed?: boolean; children?: Children };

/**
 * ui-sdk's toggle primitive rendered by leaf. The primitive holds the state and says which
 * attributes and event handlers the button gets; this component only spreads them.
 */
export function Toggle(props: ToggleProps) {
  // One primitive per component, kept across renders.
  const primitive = useMemo(
    () => toggle({ id: props.id, defaultPressed: props.defaultPressed }),
    [],
  );
  // Re-render when its state changes. The primitive is a store: get() and subscribe().
  useFarmStore(
    useMemo(() => ({ getSnapshot: primitive.get, subscribe: primitive.subscribe }), [primitive]),
  );
  const root = primitive.part("root");
  const on = handlers(root);
  return (
    <button {...attrs(root)} onClick={on.click} onKeyDown={on.keydown} onKeyUp={on.keyup}>
      {props.children}
    </button>
  );
}
