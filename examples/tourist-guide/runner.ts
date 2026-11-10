import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ConsoleLogger,
  createDefaultFrameworkConfig,
  createRunner,
  FrameworkEngine,
  type UserMessageContent
} from '@formal-agent/core';
import { createTouristGuideModelAdapter } from './adapter.js';
import { touristGuideAgent } from './implementation.js';

const engine = new FrameworkEngine(createDefaultFrameworkConfig());

const model = createTouristGuideModelAdapter();

const consoleLogger = new ConsoleLogger({
  showThoughts: true,
  showState: false,
  showRoutineTransitions: false,
  useColors: true
});

export const touristGuideRunner = createRunner({ defaultEngine: false })
  .withEngine(engine)
  .withModel(model)
  .withAgent(touristGuideAgent)
  .withOptions({
    observers: [consoleLogger],
    maxMacroCycles: 6,
    maxTicks: 12
  });

export interface TouristGuideOptions {
  imagePathOrUrl: string;
  prompt?: string;
}

export async function runTouristGuide(options: TouristGuideOptions) {
  const isUrl = /^https?:\/\//i.test(options.imagePathOrUrl);

  if (!isUrl) {
    const resolvedPath = path.resolve(options.imagePathOrUrl);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File immagine non trovato al percorso: ${resolvedPath}`);
    }
  }

  const promptText =
    options.prompt ||
    "Identifica il monumento presente nell'immagine. Se è supportato, consulta gli orari e il meteo e fornisci la guida; " +
    "altrimenti informa che la guida non è disponibile scusandoti.";

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

  return await touristGuideRunner.run({
    userContent
  });
}

