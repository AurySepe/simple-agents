# @simple-agents/adapters

Stateless model adapters and multimodal context projection strategies for `@simple-agents/core`.

Supports **Google Gemini** (Gemini 2.5 / 3.0), **SGLang**, **Ollama**, and **Llama.cpp**.

---

## Key Highlights

- **Zero Implicit Defaults**: No hidden environment variable lookups or silent fallbacks. API keys, base URLs, model identifiers, and media resolvers must be explicitly injected.
- **Multimodal Media Resolvers**: Asynchronous media resolution with decoupled storage strategies:
  - `NodeFileSystemMediaResolver`: Resolves local file paths from disk with mime-type autodetection.
  - `InMemoryMediaResolver`: Resolves virtual/in-memory buffers for isolated testing or serverless environments.
- **Flexible File Ingestion**:
  - `kind: 'path'`: Resolves files via the configured `MediaResolver`.
  - `kind: 'inline'`: Inlines base64 data directly into the model payload.
  - `kind: 'url'`: Leverages pre-uploaded Google Files API URIs (`https://generativelanguage.googleapis.com/...`) or Google Cloud Storage (`gs://...`) without downloading the file to disk.
- **Cognitive Continuity & `thoughtSignature`**: Automatically tracks and restores model reasoning traces (`thoughtSignature`) required by Gemini 2.5/3.0 across tool call cycles.
- **Typed Error Recovery**: Model deliberative failures return typed discriminated unions (`modelOk` / `modelFail` with `GeminiModelError`), enabling declarative retry and circuit-breaking policies.

---

## Installation

```bash
npm install @simple-agents/adapters @simple-agents/core zod
```

If you use Google Gemini:
```bash
npm install @google/genai
```

---

## Quickstart (Google Gemini)

```typescript
import { createGeminiAdapter, NodeFileSystemMediaResolver } from '@simple-agents/adapters';
import { createRunner } from '@simple-agents/core';
import { createDefaultExecutionEngine } from '@simple-agents/core/defaults';

// 1. Configure the media resolver (mandatory)
const mediaResolver = new NodeFileSystemMediaResolver();

// 2. Initialize the Gemini adapter with explicit parameters
const geminiAdapter = createGeminiAdapter({
  apiKey: process.env.GEMINI_API_KEY!,
  model: 'gemini-2.5-flash',
  mediaResolver,
  options: {
    temperature: 0.2,
  },
});

// 3. Bind to the runner
const runner = createRunner()
  .withEngine(createDefaultExecutionEngine())
  .withModel(geminiAdapter)
  .withAgent(myAgentContract, myAgentImpl);
```

---

## Multimodal Inputs: Images, Audio, and Documents

`@simple-agents/adapters` projects rich media into model-specific formats across three distinct sources:

### 1. Local Files (`kind: 'path'`)
Resolves paths safely through the injected `MediaResolver`:

```typescript
const result = await runner.run({
  userContent: {
    kind: 'multimodal',
    parts: [
      { kind: 'text', text: 'Analyze this receipt and extract total amounts:' },
      { kind: 'file', source: { kind: 'path', path: './documents/receipt.pdf' } },
    ],
  },
});
```

### 2. Inline Base64 (`kind: 'inline'`)
Directly transmits in-memory base64 payloads without touching the filesystem:

```typescript
{
  kind: 'file',
  source: {
    kind: 'inline',
    mimeType: 'image/png',
    data: base64EncodedImageString,
  },
}
```

### 3. Remote Google Files API / Cloud Storage (`kind: 'url'`)
Allows passing multi-gigabyte videos or large PDFs directly via URI without downloading them locally:

```typescript
{
  kind: 'file',
  source: {
    kind: 'url',
    url: 'https://generativelanguage.googleapis.com/v1beta/files/abc123xyz',
    mimeType: 'video/mp4',
  },
}
```

---

## In-Memory Testing with `InMemoryMediaResolver`

For testing and sandboxed execution, inject virtual files without touching disk:

```typescript
import { InMemoryMediaResolver } from '@simple-agents/adapters';

const mockResolver = new InMemoryMediaResolver({
  'sample.png': {
    data: Buffer.from('mock-png-bytes'),
    mimeType: 'image/png',
  },
});

const testAdapter = createGeminiAdapter({
  apiKey: 'test-key',
  model: 'gemini-2.5-flash',
  mediaResolver: mockResolver,
});
```

---

## Typed Error Handling

When the model provider returns an error (rate limits, service outage, content safety block), the adapter returns a strongly typed error object instead of throwing:

```typescript
const deliberation = await geminiAdapter.deliberate(turnContext);

if (!deliberation.ok) {
  switch (deliberation.error.kind) {
    case 'RATE_LIMIT_EXCEEDED':
      console.warn('Hit Gemini rate limit. Backing off...');
      break;
    case 'SERVICE_UNAVAILABLE':
      console.error('Gemini API temporary downtime');
      break;
    case 'SAFETY_BLOCKED':
      console.error('Prompt blocked by provider safety filters');
      break;
    default:
      console.error('Model error:', deliberation.error.message);
  }
}
```

---

## Other Supported Adapters

- **SGLang**: High-throughput structured generation via `createSglangAdapter`.
- **Ollama**: Local inference via `createOllamaAdapter`.
- **Llama.cpp**: Low-level local inference via `createLlamaCppAdapter`.

---

## License

MIT
