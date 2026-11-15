# @simple-agents/core

A strictly typed, deterministic state-machine runtime for building resilient AI agents in TypeScript.

Designed for production environments where reliability, auditability, and compile-time correctness are required.

---

## Core Philosophy: Contracts Bound to a World

Most agent frameworks mix prompts, tool implementations, and runtime state into a single tangled object. `@simple-agents/core` separates them into three clean layers:

1. **Contract (`defineAgent`)** — *What* the agent is and *what* it can do (identity, mission, typed tool schemas, typed terminations, and optional domain state schema). Zero runtime dependencies.
2. **Blueprint (`implement<TWorld>`)** — *How* the agent's tools interact with an abstract world `TWorld` (e.g., a browser session, a database, or an in-memory mock). Reusable across any environment.
3. **World Binding (`.withWorld(world)`)** — *Where* the agent runs right now. At execution time, you bind a concrete `world` instance (which can even be shared across multiple independent agents) and an initial state.

---

## Key Highlights

- **Contract-First Agent Definition**: Define your agent interface (identity, mission, tools, and termination schemas) using [Zod](https://github.com/colinhacks/zod). The schema serves as the single source of truth.
- **Decoupled Interface & Implementation**: The agent's cognitive contract is cleanly separated from infrastructure. Write your agent contract once, and bind it to real APIs, database drivers, mock runners, or test harnesses seamlessly.
- **Serializable & Resumable State**: The entire state of an agent is a plain JSON structure. Validate states offline with `agent.parseState(json)` and resume execution deterministically with `agent.runFromState(...)`.
- **Flexible Execution Granularity**: Execute end-to-end (`run`), step tick-by-tick (`step`), or pause automatically when waiting on external input (`q_yield`), feeding asynchronous responses back into the agent when ready.
- **Typed Environmental Error Handling (Zero `any`)**: Tools and models return discriminated unions (`toolOk` / `toolFail`, `modelOk` / `modelFail`). Handle network timeouts, rate limits, and service failures declaratively with `withRecovery` at compile time.

---

## Installation

```bash
npm install @simple-agents/core zod
```

---

## Quickstart

### 1. Define the Agent Contract

Define what the agent can do, what inputs it expects, and how it can terminate:

```typescript
import { z } from 'zod';
import { defineAgent } from '@simple-agents/core';

export const weatherAgent = defineAgent({
  identity: 'WeatherAssistant',
  mission: 'Provide current weather conditions and forecasts for cities.',
  tools: {
    getWeather: {
      description: 'Fetch current temperature and conditions for a given city.',
      parameters: z.object({
        city: z.string().describe('City name'),
      }),
      result: z.object({
        temperatureC: z.number(),
        condition: z.string(),
      }),
    },
  },
  terminations: {
    completed: z.object({
      summary: z.string(),
    }),
  },
});
```

### 2. Implement Tools

Bind the contract to actual logic. Use `toolOk` for successes and `toolFail` for environmental or infrastructure errors:

```typescript
import { toolOk, toolFail } from '@simple-agents/core';
import { weatherAgent } from './contract.js';

export const weatherImpl = weatherAgent.implement({
  tools: {
    getWeather: async ({ city }) => {
      try {
        // Fetch from actual API
        const data = await fetchWeatherApi(city);
        return toolOk({
          temperatureC: data.temp,
          condition: data.condition,
        });
      } catch (err) {
        return toolFail({
          kind: 'NETWORK_ERROR',
          message: `Unable to reach weather service for ${city}`,
        });
      }
    },
  },
});
```

### 3. Assemble and Run

Combine the agent definition, implementation, and a model adapter using `createRunner`:

```typescript
import { createRunner } from '@simple-agents/core';
import { createDefaultExecutionEngine } from '@simple-agents/core/defaults';
// Import any model adapter (e.g. Gemini, SGLang, Ollama) from @simple-agents/adapters
import { myModelAdapter } from './model-adapter.js';
import { weatherAgent } from './contract.js';
import { weatherImpl } from './implementation.js';

const engine = createDefaultExecutionEngine();

const runner = createRunner()
  .withEngine(engine)
  .withModel(myModelAdapter)
  .withAgent(weatherAgent, weatherImpl);

const result = await runner.run({
  userContent: {
    kind: 'text',
    text: 'What is the weather in Rome today?',
  },
});

if (result.status === 'completed') {
  console.log('Result:', result.output.summary);
}
```

---

## Core Capabilities

### Contract vs. Implementation Decoupling

Because agent declarations are decoupled from their execution environments:
- **Unit Testing**: Implement mock tools that return deterministic values instantly without hitting external services or using API credits.
- **Multi-Environment Deployment**: Run the exact same agent definition in a local CLI, an AWS Lambda function, or a Temporal durable workflow by swapping only the implementation object.

```typescript
// Test implementation with deterministic mocks
const testImpl = weatherAgent.implement({
  tools: {
    getWeather: async ({ city }) => toolOk({ temperatureC: 22, condition: 'Sunny' }),
  },
});
```

### State Serialization, Validation & Time-Travel

Agents maintain an explicit state machine. You can persist the full runtime state to a database or disk, validate it safely, and resume execution later:

```typescript
import { serializeAgentState } from '@simple-agents/core';

// 1. Serialize running state to a plain JSON string
const stateJson = serializeAgentState(result.state);

// 2. Validate and reconstruct state offline (verifies history, schemas, and transitions)
const parsed = weatherAgent.parseState(stateJson);

if (parsed.ok) {
  // 3. Resume execution from the saved state on any machine
  const resumedResult = await weatherAgent.runFromState(
    engine,
    myModelAdapter,
    weatherImpl,
    parsed.state
  );
}
```

### Execution Control: Stepping and Asynchronous Yielding

You have complete control over how the agent advances:

- **`runner.run(...)`**: Runs the agent loop until it reaches a terminal state or max steps.
- **`runner.step(...)`**: Advances the state machine by exactly one tick (e.g., one model deliberation or one tool execution). Ideal for interactive debuggers, step-by-step visualizations, and human-in-the-loop inspection.
- **Pausing on `q_yield`**: When an agent requires external input or long-running human approval, the engine can transition to `q_yield`. You can resume by feeding external payloads:

```typescript
// Inspect state tick-by-tick
let currentState = initialState;
while (!runner.isTerminal(currentState)) {
  const stepResult = await runner.step(currentState);
  console.log(`Executed step in state: ${stepResult.nextState.status}`);
  currentState = stepResult.nextState;
}
```

### Typed Environmental Errors

Tool failures and LLM outages are first-class values rather than untyped thrown exceptions:

```typescript
import { toolFail, toolOk } from '@simple-agents/core';

// Inside a tool implementation:
if (isRateLimited) {
  return toolFail({
    type: 'RATE_LIMIT',
    retryAfterSeconds: 30,
  } as const);
}

return toolOk({ data: result });
```

With `withRecovery`, you can configure declarative fallback strategies for specific error types directly in the runner.

### Two-Phase World Binding & Shared State (`AgentBlueprint` + `.withWorld()`)

`implement<TWorld>({ tools })` returns a reusable `AgentBlueprint` decoupled from any concrete runtime instance. Tool handlers receive `(args, world)` with `world` strictly typed as `TWorld`:

```typescript
interface BrowserWorld {
  currentUrl: string;
}

const navigatorBlueprint = navigatorContract.implement<BrowserWorld>({
  tools: {
    goto: async ({ url }, world) => {
      world.currentUrl = url;
      return toolOk({ ok: true });
    },
  },
});

const sharedWorld: BrowserWorld = { currentUrl: 'about:blank' };

const runner = createRunner()
  .withModel(myModelAdapter)
  .withAgent(navigatorBlueprint)
  .withWorld(sharedWorld); // Required at compile time when TWorld is defined
```

If the agent contract defines a `stateSchema`, TypeScript also enforces `.withInitialState(Ds)` on the builder before `.run()` or `.spawn()` can be called.

### Pure Interceptor Pipeline (`beforeDeliberation`, `beforeToolUse`, `afterToolUse`)

Register composable, type-safe interceptors directly on `RunnerBuilder`. Each interceptor receives an immutable `Readonly` `state` and `world: TWorld`, and can optionally return a new `Ds` that is chained immutably to the next interceptor:

```typescript
const result = await createRunner()
  .withModel(myModelAdapter)
  .withAgent(navigatorBlueprint)
  .withWorld(sharedWorld)
  .withInitialState({ lastUrl: null })
  .beforeDeliberation(({ state, world }) => ({
    ...state.Ds,
    lastUrl: world.currentUrl,
  }))
  .afterToolUse(({ state, toolId }) => {
    console.log(`Executed ${toolId} in state`, state.Ds);
  })
  .run({ userContent: { kind: 'text', text: 'Navigate to example.com' } });
```

---

## License

MIT

