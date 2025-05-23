import {
  ImageGenInput,
  Model,
  NoiseSchedule,
  Resolution,
  Sampling,
} from '../backends/imageGen';
import { CircularQueue } from '../circularQueue';

import { v4 as uuidv4, v4 } from 'uuid';
import ExifReader from 'exifreader';
import { ElectornBackend } from '../backends/electronBackend';
import { AndroidBackend } from '../backends/androidBackend';
import extractChunks from 'png-chunks-extract';
import encodeChunks from 'png-chunks-encode';
import { Buffer } from 'buffer';
import { FileEntry } from '../backend';
import { Session } from 'inspector';
import { GameService } from './GameService';
import { ImageService } from './ImageService';
import { LoginService } from './LoginService';
import { PromptService } from './PromptService';
import { SessionService } from './SessionService';
import { taskHandlers, TaskQueueService } from './TaskQueueService';
import { LocalAIService } from './LocalAIService';
import { AppUpdateNoticeService } from './AppUpdateNoticeService';
import { WorkFlowService } from './workflows/WorkFlowService';
import { registerWorkFlows } from './workflows';

export const backend =
  window.electron != null ? new ElectornBackend() : new AndroidBackend();

export const isMobile = window.electron == null;

export class ZipService extends EventTarget {
  isZipping: boolean;
  constructor() {
    super();
    this.isZipping = false;
  }

  async zipFiles(files: FileEntry[], outPath: string) {
    this.isZipping = true;
    await backend.zipFiles(files, outPath);
    this.isZipping = false;
  }
}

export const zipService = new ZipService();

export const sessionService = new SessionService();
sessionService.run();

export const imageService = new ImageService();

export const promptService = new PromptService();

export const taskQueueService = new TaskQueueService(taskHandlers);

export const loginService = new LoginService();

export const gameService = new GameService();

export const workFlowService = new WorkFlowService();
registerWorkFlows(workFlowService);

window.promptService = promptService;
window.sessionService = sessionService;
window.imageService = imageService;
window.taskQueueService = taskQueueService;
window.loginService = loginService;

backend.onClose(() => {
  (async () => {
    await sessionService.saveAll();
    await backend.close();
  })();
});

export const appUpdateNoticeService = new AppUpdateNoticeService();
appUpdateNoticeService.run();

export const localAIService = new LocalAIService();
localAIService.statsModels();
