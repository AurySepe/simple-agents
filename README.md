# Simple Agents

**Simple, strictly-typed AI agents in TypeScript — built around contracts, reusable blueprints, and explicit world binding.**

`@simple-agents` gives you deterministic state-machine execution, compile-time type safety (zero `any`), and clean separation between *what* an agent does and *where* it runs.

---

## Philosophy: Contract → Blueprint → World

Most agent frameworks tangle prompts, tool side-effects, and runtime state together. Simple Agents separates them into three clear layers:

1. **Contract (`defineAgent`)** — Declare *what* the agent can do (identity, mission, Zod-typed tools, and typed terminations). Zero runtime dependencies.
2. **Blueprint (`implement<TWorld>`)** — Define *how* tools interact with an abstract world `TWorld` (a browser session, a database, or an in-memory mock). Reusable across any environment.
3. **World Binding (`.withWorld(world)`)** — Bind a concrete `world` instance at execution time. Multiple independent agents can share the same world safely.

---

## Quick Example

```typescript
import { z } from 'zod';
import { defineAgent, createRunner, toolOk } from '@simple-agents/core';
import { createGeminiAdapter, NodeFileSystemMediaResolver } from '@simple-agents/adapters';

// 1. Define the Contract
const supportAgent = defineAgent({
  identity: 'SupportAgent',
  mission: 'Look up order status and answer customer questions.',
  tools: {
    getOrder: {
      description: 'Fetch order status by ID.',
      parameters: z.object({ orderId: z.string() }),
      returns: z.object({ status: z.string(), total: z.number() }),
    },
  },
  terminations: {
    reply: {
      description: 'Send final answer to the customer.',
      schema: z.object({ message: z.string() }),
    },
  },
});

// 2. Create a Reusable Blueprint
interface AppWorld {
  db: { findOrder(id: string): Promise<{ status: string; total: number }> };
}

const supportBlueprint = supportAgent.implement<AppWorld>({
  tools: {
    getOrder: async ({ orderId }, world) => {
      const order = await world.db.findOrder(orderId);
      return toolOk(order);
    },
  },
});

// 3. Bind to a World and Run
const result = await createRunner()
  .withModel(
    createGeminiAdapter({
      apiKey: process.env.GEMINI_API_KEY!,
      model: 'gemini-2.5-flash',
      mediaResolver: new NodeFileSystemMediaResolver(),
    })
  )
  .withAgent(supportBlueprint)
  .withWorld({ db: productionDatabase })
  .run({ userContent: { kind: 'text', text: 'Where is order #1234?' } });
```

### Handling Typed Terminations

Unlike frameworks that return unstructured text, a Simple Agent **must** finish by invoking one of the `terminations` declared in its contract (e.g. `reply`, `escalate`, `notFound`). TypeScript narrows `result.result` into a discriminated union:

```typescript
if (result.ok && result.status === 'halt') {
  switch (result.result.type) {
    case 'reply':
      // result.result.payload is strictly typed as { message: string }
      console.log('Agent replied:', result.result.payload.message);
      break;
  }
}
```

**Example execution trace:**
1. **Turn 0**: The model reads *"Where is order #1234?"* and calls `getOrder({ orderId: '1234' })`.
2. **Tool Execution**: `supportBlueprint` runs `getOrder` against `AppWorld.db` and returns `toolOk({ status: 'shipped', total: 49.9 })`.
3. **Turn 1**: The model sees the tool result and terminates by calling `reply({ message: 'Order #1234 has been shipped (total: $49.90).' })`.
4. **Halt**: `runner.run()` returns `{ ok: true, status: 'halt', result: { type: 'reply', payload: { message: '...' } } }`.

---

## Why Simple Agents?

- **End-to-End Type Safety**: Tool parameters, tool returns, environmental errors (`toolOk` / `toolFail`), domain state (`Ds`), and terminations are all inferred from your Zod contract.
- **Serializable & Resumable**: Agent state is plain JSON. Save it with `serializeAgentState(state)`, validate it offline with `agent.parseState(json)`, and resume with `runFromState(...)`.
- **Pure Interceptor Pipeline**: Hook into `.beforeDeliberation()`, `.beforeToolUse()`, and `.afterToolUse()` on the runner builder to synchronize `TWorld → Ds` immutably.
- **Zero Implicit Defaults**: Model adapters never read hidden environment variables or silently fall back.

---

## Packages

| Package | Description | Docs |
| :--- | :--- | :--- |
| **`@simple-agents/core`** | Contracts, blueprints, state-machine runtime, `RunnerBuilder`, and typed errors | [packages/core/README.md](./packages/core/README.md) |
| **`@simple-agents/adapters`** | Stateless adapters for Gemini, SGLang, Ollama, Llama.cpp, and `MediaResolver` | [packages/adapters/README.md](./packages/adapters/README.md) |

> **Using an AI coding assistant?** Point it to [llms.txt](./llms.txt) for a high-density reference of all patterns and rules.

---

## License

MIT
