import { CharacterPosition } from '../models/types';

export enum Model {
  Anime = 'anime',
  Inpaint = 'inpaint',
  I2I = 'i2i',
}

export enum ModelVersion {
  V4_5 = '4-5-full',
  V4_5Curated = '4-5-curated',
  V4 = '4-full',
  V4Curated = '4-curated',
}

export enum Resolution {
  SmallLandscape = 'small_landscape',
  SmallPortrait = 'small_portrait',
  SmallSquare = 'small_square',
  Landscape = 'landscape',
  Portrait = 'portrait',
  Square = 'square',
  LargeLandscape = 'large_landscape',
  LargePortrait = 'large_portrait',
  LargeSquare = 'large_square',
  WallpaperPortrait = 'wallpaper_portrait',
  WallpaperLandscape = 'wallpaper_landscape',
  Custom = 'custom',
}

export const upscaleReoslution = (resolution: Resolution) => {
  switch (resolution) {
    case Resolution.SmallLandscape:
      return Resolution.Landscape;
    case Resolution.SmallPortrait:
      return Resolution.Portrait;
    case Resolution.SmallSquare:
      return Resolution.Square;
    case Resolution.Landscape:
      return Resolution.LargeLandscape;
    case Resolution.Portrait:
      return Resolution.LargePortrait;
    case Resolution.Square:
      return Resolution.LargeSquare;
    case Resolution.WallpaperPortrait:
      return Resolution.WallpaperPortrait;
    case Resolution.WallpaperLandscape:
      return Resolution.WallpaperLandscape;
    case Resolution.Custom:
      return Resolution.Custom;
    default:
      return resolution;
  }
};

export const resolutionMap = {
  small_landscape: { height: 512, width: 768 },
  small_portrait: { height: 768, width: 512 },
  small_square: { height: 640, width: 640 },
  landscape: { height: 832, width: 1216 },
  portrait: { height: 1216, width: 832 },
  square: { height: 1024, width: 1024 },
  large_landscape: { height: 1024, width: 1536 },
  large_portrait: { height: 1536, width: 1024 },
  large_square: { height: 1472, width: 1472 },
  wallpaper_portrait: { height: 1088, width: 1920 },
  wallpaper_landscape: { height: 1920, width: 1088 },
  custom: { height: 0, width: 0 },
} as const;

export const convertResolution = (resolution: Resolution): ImageSize => {
  return {
    width: resolutionMap[resolution].width,
    height: resolutionMap[resolution].height,
  };
};

export enum Sampling {
  KEulerAncestral = 'k_euler_ancestral',
  KEuler = 'k_euler',
  KDPMPP2SAncestral = 'k_dpmpp_2s_ancestral',
  KDPMPP2M = 'k_dpmpp_2m',
  KDPMPPSDE = 'k_dpmpp_sde',
  KDPMPP2MSDE = 'k_dpmpp_2m_sde',
  DDIM = 'ddim_v3',
}

export enum NoiseSchedule {
  Native = 'native',
  Karras = 'karras',
  Exponential = 'exponential',
  Polyexponential = 'polyexponential',
}

export interface Vibe {
  image: string;
  info: number;
  strength: number;
}

export interface ImageSize {
  width: number;
  height: number;
}

export interface ImageGenInput {
  model: Model;
  prompt: string;
  uc: string;
  resolution: ImageSize;
  sampling: Sampling;
  outputFilePath: string;
  steps: number;
  promptGuidance: number;
  cfgRescale: number;
  noiseSchedule: NoiseSchedule;
  vibes: Vibe[];
  image?: string;
  mask?: string;
  noise?: number;
  imageStrength?: number;
  seed?: number;
  originalImage?: boolean;
  useCoords?: boolean;
  legacyPromptConditioning?: boolean;
  normalizeStrength?: boolean;
  varietyPlus?: boolean;
  characterPrompts?: string[];
  characterUCs?: string[];
  characterPositions?: CharacterPosition[];
}

export type AugmentMethod =
  | 'lineart'
  | 'colorize'
  | 'bg-removal'
  | 'declutter'
  | 'emotion'
  | 'sketch';

export interface ImageAugmentInput {
  method: AugmentMethod;
  outputFilePath: string;
  emotion?: string;
  prompt?: string;
  weaken?: number;
  image: string;
}

export interface EncodeVibeImageInput {
  image: string;
  info: number;
}

export interface ImageGenService {
  login(email: string, password: string): Promise<{ accessToken: string }>;
  generateImage(token: string, params: ImageGenInput): Promise<string>;
  augmentImage(token: string, params: ImageAugmentInput): Promise<string>;
  getRemainCredits(token: string): Promise<number>;
  encodeVibeImage(token: string, params: EncodeVibeImageInput): Promise<string>;
}
