import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ConsoleLogger,
  createDefaultFrameworkConfig,
  createRunner,
  defaultItalianMarkdownProjector,
  defaultItalianPolicy,
  FrameworkEngine,
  type UserMessageContent
} from '@formal-agent/core';
import { createVisionAdapter } from './adapter.js';
import { imageDescriberAgent } from './implementation.js';

// 1. Motore invariante di livello 1
const engine = new FrameworkEngine(
  createDefaultFrameworkConfig({
    systemFrameProjector: defaultItalianMarkdownProjector,
    policy: defaultItalianPolicy
  })
);

// 2. Modello VLM con capacità visuali
const visionModel = createVisionAdapter();

// 3. Logger per stampare i passi a video in tempo reale
const consoleLogger = new ConsoleLogger({
  showThoughts: true,
  showState: false,
  showRoutineTransitions: false,
  useColors: true
});

// 4. Runner pre-configurato e collegato all'agente visuale
export const visionRunner = createRunner({ defaultEngine: false })
  .withEngine(engine)
  .withModel(visionModel)
  .withAgent(imageDescriberAgent)
  .withOptions({
    observers: [consoleLogger],
    maxMacroCycles: 5,
    maxTicks: 10
  });

export interface DescribeImageOptions {
  imagePathOrUrl: string;
  prompt?: string;
}

/**
 * Funzione di alto livello per richiedere la descrizione di un'immagine.
 * Costruisce automaticamente il payload fortemente tipizzato UserMessageContent.
 */
export async function describeImage(options: DescribeImageOptions) {
  const isUrl = /^https?:\/\//i.test(options.imagePathOrUrl);

  if (!isUrl) {
    const resolvedPath = path.resolve(options.imagePathOrUrl);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File immagine non trovato al percorso: ${resolvedPath}`);
    }
  }

  const promptText = options.prompt || "Descrivi dettagliatamente l'immagine fornita, evidenziando gli elementi chiave ed eventuale testo visibile.";

  const userContent: UserMessageContent = {
    kind: 'text_with_media',
    text: promptText,
    files: [
      {
        modality: 'image',
        source: isUrl
          ? { kind: 'url', url: options.imagePathOrUrl }
          : { kind: 'path', filePath: path.resolve(options.imagePathOrUrl) },
        filename: path.basename(options.imagePathOrUrl)
      }
    ]
  };

  return await visionRunner.run({
    userContent
  });
}
