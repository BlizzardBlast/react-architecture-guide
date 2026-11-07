# Cross-context messaging (Workers, iframes, tabs)

Use a messaging boundary **only when execution contexts genuinely differ**, such as a browser Web Worker, `MessagePort`, trusted iframe or `BroadcastChannel`. Prefer props, local state, existing data fetching or ordinary function calls for in-process React communication. A fixed, one-way `postMessage` call may not warrant a new abstraction.

## Contract and ownership

- Define **directional** message-name/payload maps shared by the two participants. Include only structured-clone-compatible data. Keep business-specific contracts in the owning module's integration-facing code; a generic `shared/` transport must not import that module's business types.
- Keep a channel responsible for encoding, routing and subscriptions, not business logic. A transport adapter handles `Worker`, `MessagePort`, `BroadcastChannel` or another platform boundary. Only extract an adapter when the same technical responsibility is actually reused.
- Use explicit message names and typed request/response maps rather than casts at each call site. For an optional dependency, evaluate [`typed-channel`](https://github.com/psd-coder/typed-channel); it keeps one-way messages separate from optional RPC. Do not add it where plain platform APIs already suffice.
- Treat contracts as a protocol when versions can drift (for example, an iframe independently deployed from its parent): document compatibility and test unsupported versions instead of assuming both sides always upgrade together.

For a simple module, a transport-facing contract can live at `modules/reports/api/worker-messages.ts` and be type-imported by the UI and worker. Keep pure `model/` code independent of Worker APIs. For complex modules, a transport-neutral application contract can be implemented by an infrastructure adapter without importing concrete transports into `application/` or `domain/`.

## Small Worker example

```ts
// modules/reports/api/worker-messages.ts
export type ToWorker = {
  "sum:run": { values: number[] };
};

export type FromWorker = {
  "sum:finished": { total: number };
};
```

```ts
// modules/reports/ui/summary-worker.ts
import { createTypedChannel } from "typed-channel";
import { createPostMessageTransport } from "typed-channel/transports/postMessage";
import type { FromWorker, ToWorker } from "../api/worker-messages";

export function startSummaryWorker(onResult: (total: number) => void) {
  const worker = new Worker(new URL("../api/summary.worker.ts", import.meta.url), {
    type: "module",
  });
  const channel = createTypedChannel(
    createPostMessageTransport<FromWorker, ToWorker>(worker),
  );
  const unsubscribe = channel.on("sum:finished", ({ total }) => onResult(total));

  return {
    run(values: number[]) {
      channel.emit("sum:run", { values });
    },
    dispose() {
      unsubscribe();
      channel.unlisten();
      worker.terminate();
    },
  };
}
```

The Worker endpoint imports the same maps and reverses the transport's generic parameters: `createPostMessageTransport<ToWorker, FromWorker>(self)`. This example illustrates the API and lifecycle; it is **not** a bundled, typechecked runnable example, nor proof of the third-party library's behavior. Place worker source behind the existing [checked local Worker import rules](dependency-rules.md).

## Runtime safety and lifecycle

- **Compile-time typing is not validation.** Validate `event.data` from untrusted or independently deployed participants at the receive boundary (for example with a schema). Reject unexpected names, payload shapes and protocol versions. Never treat a TypeScript cast or typed wrapper as proof of authenticity.
- For cross-window communication, verify the intended `event.origin` **and** `event.source` before accepting a message, and send with an exact, trusted `targetOrigin` rather than `*` for sensitive traffic. If a `MessageChannel` is transferred to an iframe, establish its initial handshake with the same safeguards. Same-origin `BroadcastChannel` is not authentication; avoid sending secrets or trusting another tab's claims.

  **Important iframe constraint:** The stock `typed-channel` `createPostMessageTransport` forwards incoming `event.data` without checking origin/source and calls `postMessage(message)` without a caller-selected `targetOrigin`. Do **not** treat that stock transport as an authenticated iframe channel. For an iframe, implement a custom transport that subscribes to the parent window's `message` events, checks both the exact allowed origin and expected `event.source`, validates the untrusted payload, and sends using `iframe.contentWindow.postMessage(message, allowedOrigin)`. Revalidate peers after navigation, scope the handshake to a trusted document, and remove the subscription when disposed. The Worker example above does not demonstrate or certify an iframe security boundary.
- Return or retain unsubscribe functions and disconnect listeners when the owner unmounts. Dispose owned Workers/ports, reject pending work and handle peer shutdown or crashes. An Effect that subscribes must clean up its subscription; consider React Strict Mode's development remount behavior.
- If the caller needs a response, use request identifiers, typed results and a bounded timeout or `AbortSignal`. An unhandled request may otherwise wait forever. Signal propagation is **cooperative**: the handler must observe its signal and stop; it cannot preempt arbitrary synchronous work. Do not assume a timeout proves peer failure or that cancellation cancels every side effect.
- Account for structured-clone costs on large payloads; evaluate transferables and profile before moving work to a Worker for performance.

## Verification when a messaging boundary exists

- Typecheck legitimate sends and receives, and test rejected names or payloads (for instance with compiler-negative assertions).
- Exercise malformed/untrusted payloads, unexpected origins and sources, stale replies, missing or crashed peers, and unsupported protocol versions where relevant.
- Test timeout/abort propagation with a handler that cooperates, plus cleanup on unmount/dispose without duplicate callbacks or orphaned promises.
- Run actual Worker/iframe/browser integration checks as applicable. The architecture checker verifies **import ownership**, not protocol behavior, message validity or runtime security.

This guidance adapts ideas from [Evil Martians' `postMessage` article](https://evilmartians.com/chronicles/how-to-make-postmessage-type-safe-in-under-350-bytes); it does not require `typed-channel` in the reference app or any consuming repository.
