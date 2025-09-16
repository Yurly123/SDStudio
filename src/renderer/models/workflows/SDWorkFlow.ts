import { NoiseSchedule, Sampling } from '../../backends/imageGen';
import {
  WFDefBuilder,
  wfiGroup,
  wfiInlineInput,
  wfiMiddlePlaceholderInput,
  wfiPresetSelect,
  wfiProfilePresetSelect,
  wfiPush,
  wfiStack,
  WFVarBuilder,
} from './WorkFlow';
import {
  Session,
  GenericScene,
  SDJob,
  Scene,
  SDAbstractJob,
  PromptNode,
  SDInpaintJob,
  SDI2IJob,
  CharacterPrompt,
} from '../types';
import {
  createSDCharacterPrompts,
  createSDPrompts,
  defaultBPrompt,
  defaultFPrompt,
  defaultUC,
  lowerPromptNode,
} from '../PromptService';
import { imageService, taskQueueService, workFlowService } from '..';
import { TaskParam } from '../TaskQueueService';
import { dataUriToBase64 } from '../ImageService';

const SDImageGenPreset = new WFVarBuilder()
  .addIntVar('cfgRescale', 0, 1, 0.01, 0)
  .addIntVar('steps', 1, 50, 1, 28)
  .addIntVar('promptGuidance', 0, 10, 0.1, 5)
  .addSamplingVar('sampling', Sampling.KEulerAncestral)
  .addPromptVar('frontPrompt', defaultFPrompt)
  .addPromptVar('backPrompt', defaultBPrompt)
  .addPromptVar('uc', defaultUC)
  .addNoiseScheduleVar('noiseSchedule', NoiseSchedule.Karras)
  .addCharacterPromptsVar('characterPrompts', [])
  .addBoolVar('useCoords', false)
  .addBoolVar('legacyPromptConditioning', false)
  .addBoolVar('varietyPlus', false);

const SDImageGenShared = new WFVarBuilder()
  .addVibeSetVar('vibes')
  .addBoolVar('normalizeStrength', true)
  .addNullIntVar('seed')
  .addCharacterReferenceVar('characterReferences');

const SDImageGenUI = wfiStack([
  wfiPresetSelect(),
  wfiInlineInput('상위 프롬프트', 'frontPrompt', 'preset', 'flex-1'),
  wfiMiddlePlaceholderInput('중간 프롬프트 (이 씬에만 적용됨)'),
  wfiInlineInput('하위 프롬프트', 'backPrompt', 'preset', 'flex-1'),
  wfiInlineInput('네거티브 프롬프트', 'uc', 'preset', 'flex-1'),
  wfiInlineInput('시드', 'seed', 'shared', 'flex-none'),
  wfiInlineInput('캐릭터 프롬프트', 'characterPrompts', 'preset', 'flex-none'),
  wfiGroup('샘플링 설정', [
    wfiPush('top'),
    wfiInlineInput('스탭 수', 'steps', 'preset', 'flex-none'),
    wfiInlineInput(
      '프롬프트 가이던스',
      'promptGuidance',
      'preset',
      'flex-none',
    ),
    wfiInlineInput('샘플링', 'sampling', 'preset', 'flex-none'),
    wfiInlineInput('노이즈 스케줄', 'noiseSchedule', 'preset', 'flex-none'),
    wfiInlineInput('CFG 리스케일', 'cfgRescale', 'preset', 'flex-none'),
    wfiInlineInput('캐릭터 위치 지정', 'useCoords', 'preset', 'flex-none'),
    wfiInlineInput(
      'Legacy Prompt Conditioning 모드',
      'legacyPromptConditioning',
      'preset',
      'flex-none',
    ),
    wfiInlineInput(
      '바이브 강도 정규화',
      'normalizeStrength',
      'shared',
      'flex-none',
    ),
    wfiInlineInput('Variety+', 'varietyPlus', 'preset', 'flex-none'),
  ]),
  wfiInlineInput('바이브 설정', 'vibes', 'shared', 'flex-none'),
  wfiInlineInput('캐릭터 레퍼런스', 'characterReferences', 'shared', 'flex-none'),
]);

const SDImageGenEasyPreset = new WFVarBuilder()
  .addIntVar('cfgRescale', 0, 1, 0.01, 0)
  .addIntVar('steps', 1, 50, 1, 28)
  .addIntVar('promptGuidance', 0, 10, 0.1, 5)
  .addSamplingVar('sampling', Sampling.KEulerAncestral)
  .addPromptVar('frontPrompt', defaultFPrompt)
  .addPromptVar('backPrompt', defaultBPrompt)
  .addPromptVar('uc', defaultUC)
  .addNoiseScheduleVar('noiseSchedule', NoiseSchedule.Karras)
  .addBoolVar('useCoords', false)
  .addBoolVar('legacyPromptConditioning', false)
  .addBoolVar('varietyPlus', false);

const SDImageGenEasyShared = SDImageGenShared.clone()
  .addPromptVar('characterPrompt', '')
  .addPromptVar('backgroundPrompt', '')
  .addPromptVar('uc', '')
  .addCharacterPromptsVar('characterPrompts', []);

const SDImageGenEasyUI = wfiStack([
  wfiProfilePresetSelect(),
  wfiInlineInput('캐릭터 관련 태그', 'characterPrompt', 'shared', 'flex-1'),
  wfiMiddlePlaceholderInput('중간 프롬프트 (이 씬에만 적용됨)'),
  wfiInlineInput('배경 관련 태그', 'backgroundPrompt', 'shared', 'flex-1'),
  wfiInlineInput('태그 밴 리스트', 'uc', 'shared', 'flex-1'),
  wfiInlineInput('시드', 'seed', 'shared', 'flex-none'),
  wfiInlineInput('캐릭터 프롬프트', 'characterPrompts', 'shared', 'flex-none'),
  wfiInlineInput('바이브 설정', 'vibes', 'shared', 'flex-none'),
  wfiInlineInput('캐릭터 레퍼런스', 'characterReferences', 'shared', 'flex-none'),
]);

const SDImageGenEasyInnerUI = wfiStack([
  wfiInlineInput('상위 프롬프트', 'frontPrompt', 'preset', 'flex-1'),
  wfiMiddlePlaceholderInput('중간 프롬프트 (이 창에만 적용됨)'),
  wfiInlineInput('하위 프롬프트', 'backPrompt', 'preset', 'flex-1'),
  wfiInlineInput('네거티브 프롬프트', 'uc', 'preset', 'flex-1'),
  wfiGroup('샘플링 설정', [
    wfiPush('top'),
    wfiInlineInput('스탭 수', 'steps', 'preset', 'flex-none'),
    wfiInlineInput(
      '프롬프트 가이던스',
      'promptGuidance',
      'preset',
      'flex-none',
    ),
    wfiInlineInput('샘플링', 'sampling', 'preset', 'flex-none'),
    wfiInlineInput('노이즈 스케줄', 'noiseSchedule', 'preset', 'flex-none'),
    wfiInlineInput('CFG 리스케일', 'cfgRescale', 'preset', 'flex-none'),
    wfiInlineInput('캐릭터 위치 지정', 'useCoords', 'preset', 'flex-none'),
    wfiInlineInput(
      'Legacy Prompt Conditioning 모드',
      'legacyPromptConditioning',
      'preset',
      'flex-none',
    ),
    wfiInlineInput(
      '바이브 강도 정규화',
      'normalizeStrength',
      'shared',
      'flex-none',
    ),
    wfiInlineInput('Variety+', 'varietyPlus', 'preset', 'flex-none'),
  ]),
]);

const SDImageGenHandler = async (
  session: Session,
  scene: GenericScene,
  prompt: PromptNode,
  characterPrompts: PromptNode[],
  preset: any,
  shared: any,
  samples: number,
  meta?: any,
  onComplete?: (img: string) => void,
  nodelay?: boolean,
) => {
  const job: SDJob = {
    type: 'sd',
    cfgRescale: preset.cfgRescale,
    steps: preset.steps,
    promptGuidance: preset.promptGuidance,
    prompt: prompt,
    sampling: preset.sampling,
    uc: preset.uc,
    characterPrompts: (shared.type === 'SDImageGenEasy'
      ? shared.characterPrompts
      : preset.characterPrompts
    ).map((p: CharacterPrompt, i: number) => ({
      ...p,
      prompt: characterPrompts[i],
    })),
    useCoords: preset.useCoords,
    legacyPromptConditioning: preset.legacyPromptConditioning,
    normalizeStrength: shared.normalizeStrength,
    varietyPlus: preset.varietyPlus,
    characterReferences: shared.characterReferences,
    noiseSchedule: preset.noiseSchedule,
    backend: preset.backend,
    vibes: shared.vibes,
    seed: shared.seed,
  };
  if (shared.type === 'SDImageGenEasy') {
    job.uc = shared.uc + ', ' + preset.uc;
  }
  const param: TaskParam = {
    session: session,
    job: job,
    scene: scene,
    nodelay: nodelay,
    outputPath: imageService.getOutputDir(session, scene),
    onComplete: onComplete,
  };
  taskQueueService.addTask(param, samples);
};

const SDCreatePrompt = async (
  session: Session,
  scene: GenericScene,
  preset: any,
  shared: any,
) => {
  return await createSDPrompts(session, preset, shared, scene as Scene);
};

const SDCreateCharacterPrompts = async (
  session: Session,
  scene: GenericScene,
  preset: any,
  shared: any,
) => {
  return await createSDCharacterPrompts(
    session,
    preset,
    shared,
    scene as Scene,
  );
};

export const SDImageGenDef = new WFDefBuilder('SDImageGen')
  .setTitle('이미지 생성')
  .setBackendType('image')
  .setI2I(false)
  .setPresetVars(SDImageGenPreset.build())
  .setSharedVars(SDImageGenShared.build())
  .setEditor(SDImageGenUI)
  .setHandler(SDImageGenHandler)
  .setCreatePrompt(SDCreatePrompt)
  .setCreateCharacterPrompts(SDCreateCharacterPrompts)
  .build();

export const SDImageGenEasyDef = new WFDefBuilder('SDImageGenEasy')
  .setTitle('이미지 생성 (이지모드)')
  .setBackendType('image')
  .setI2I(false)
  .setPresetVars(SDImageGenEasyPreset.build())
  .setSharedVars(SDImageGenEasyShared.build())
  .setEditor(SDImageGenEasyUI)
  .setInnerEditor(SDImageGenEasyInnerUI)
  .setHandler(SDImageGenHandler)
  .setCreatePrompt(SDCreatePrompt)
  .setCreateCharacterPrompts(SDCreateCharacterPrompts)
  .build();

const SDInpaintPreset = new WFVarBuilder()
  .addImageVar('image')
  .addImageVar('mask')
  .addIntVar('strength', 0, 1, 0.01, 0.7)
  .addIntVar('noise', 0, 1, 0.01, 0)
  .addIntVar('cfgRescale', 0, 1, 0.01, 0)
  .addIntVar('steps', 1, 50, 1, 28)
  .addIntVar('promptGuidance', 0, 10, 0.1, 5)
  .addBoolVar('originalImage', true)
  .addSamplingVar('sampling', Sampling.KEulerAncestral)
  .addPromptVar('prompt', '')
  .addPromptVar('uc', '')
  .addNoiseScheduleVar('noiseSchedule', NoiseSchedule.Karras)
  .addCharacterPromptsVar('characterPrompts', [])
  .addBoolVar('useCoords', false)
  .addBoolVar('legacyPromptConditioning', false)
  .addBoolVar('normalizeStrength', true)
  .addBoolVar('varietyPlus', false)
  .addVibeSetVar('vibes')
  .addNullIntVar('seed');

const SDInpaintUI = wfiStack([
  wfiInlineInput('이미지', 'image', 'preset', 'flex-none'),
  wfiInlineInput('인페인트 강도', 'strength', 'preset', 'flex-none'),
  wfiInlineInput('노이즈', 'noise', 'preset', 'flex-none'),
  wfiInlineInput(
    '비마스크 영역 편집 방지',
    'originalImage',
    'preset',
    'flex-none',
  ),
  wfiInlineInput('프롬프트', 'prompt', 'preset', 'flex-1'),
  wfiInlineInput('네거티브 프롬프트', 'uc', 'preset', 'flex-1'),
  wfiInlineInput('캐릭터 프롬프트', 'characterPrompts', 'preset', 'flex-none'),
  wfiGroup('샘플링 설정', [
    wfiPush('top'),
    wfiInlineInput('스탭 수', 'steps', 'preset', 'flex-none'),
    wfiInlineInput(
      '프롬프트 가이던스',
      'promptGuidance',
      'preset',
      'flex-none',
    ),
    wfiInlineInput('샘플링', 'sampling', 'preset', 'flex-none'),
    wfiInlineInput('노이즈 스케줄', 'noiseSchedule', 'preset', 'flex-none'),
    wfiInlineInput('CFG 리스케일', 'cfgRescale', 'preset', 'flex-none'),
    wfiInlineInput('캐릭터 위치 지정', 'useCoords', 'preset', 'flex-none'),
    wfiInlineInput(
      'Legacy Prompt Conditioning 모드',
      'legacyPromptConditioning',
      'preset',
      'flex-none',
    ),
    wfiInlineInput(
      '바이브 강도 정규화',
      'normalizeStrength',
      'preset',
      'flex-none',
    ),
    wfiInlineInput('Variety+', 'varietyPlus', 'preset', 'flex-none'),
  ]),
  wfiInlineInput('바이브 설정', 'vibes', 'preset', 'flex-none'),
  // wfiInlineInput('시드', 'seed', true, 'flex-none'),
]);

const createSDI2IHandler = (type: string) => {
  const handler = async (
    session: Session,
    scene: GenericScene,
    prompt: PromptNode,
    characterPrompts: PromptNode[],
    preset: any,
    shared: any,
    samples: number,
    meta?: any,
    onComplete?: (img: string) => void,
  ) => {
    const image = preset.image.endsWith('.png')
      ? dataUriToBase64(
          (await imageService.fetchVibeImage(session, preset.image))!,
        )
      : preset.image;
    const isInpaint = type === 'SDInpaint';
    const getMask = async () =>
      dataUriToBase64(
        (await imageService.fetchVibeImage(session, preset.mask))!,
      );
    const job: SDInpaintJob | SDI2IJob = {
      type: isInpaint ? 'sd_inpaint' : 'sd_i2i',
      cfgRescale: preset.cfgRescale,
      steps: preset.steps,
      promptGuidance: preset.promptGuidance,
      prompt: { type: 'text', text: preset.prompt },
      sampling: preset.sampling,
      uc: preset.uc,
      characterPrompts: preset.characterPrompts.map((p: CharacterPrompt) => ({
        ...p,
        prompt: { type: 'text', text: p.prompt || '' },
      })),
      useCoords: preset.useCoords,
      legacyPromptConditioning: preset.legacyPromptConditioning,
      normalizeStrength: preset.normalizeStrength,
      varietyPlus: preset.varietyPlus,
      noiseSchedule: preset.noiseSchedule,
      characterReferences: preset.characterReferences,
      backend: preset.backend,
      vibes: preset.vibes,
      strength: preset.strength,
      noise: preset.noise,
      overrideResolution: preset.overrideResolution,
      originalImage: isInpaint ? preset.originalImage : true,
      image: image,
      mask: isInpaint ? await getMask() : '',
    };
    const param: TaskParam = {
      session: session,
      job: job,
      scene: scene,
      outputPath: imageService.getOutputDir(session, scene),
      onComplete: onComplete,
    };
    taskQueueService.addTask(param, samples);
  };
  return handler;
};

export function createInpaintPreset(
  job: SDAbstractJob<string>,
  image?: string,
  mask?: string,
): any {
  const preset = workFlowService.buildPreset('SDInpaint');
  preset.image = image;
  preset.mask = mask;
  preset.cfgRescale = job.cfgRescale;
  preset.promptGuidance = job.promptGuidance;
  preset.sampling = job.sampling;
  preset.noiseSchedule = job.noiseSchedule;
  preset.prompt = job.prompt;
  preset.uc = job.uc;
  preset.characterPrompts = job.characterPrompts;
  preset.useCoords = job.useCoords;
  preset.legacyPromptConditioning = job.legacyPromptConditioning;
  preset.normalizeStrength = job.normalizeStrength;
  preset.varietyPlus = job.varietyPlus;
  return preset;
}

export const SDInpaintDef = new WFDefBuilder('SDInpaint')
  .setTitle('인페인트')
  .setBackendType('image')
  .setEmoji('🖌️')
  .setI2I(true)
  .setHasMask(true)
  .setPresetVars(SDInpaintPreset.build())
  .setSharedVars(new WFVarBuilder().build())
  .setEditor(SDInpaintUI)
  .setHandler(createSDI2IHandler('SDInpaint'))
  .setCreatePreset(createInpaintPreset)
  .build();

const SDI2IPreset = SDInpaintPreset.clone()
  .addStringVar('overrideResolution', '',)
  .addCharacterReferenceVar('characterReferences');

const SDI2IUI = wfiStack([
  wfiInlineInput('이미지', 'image', 'preset', 'flex-none'),
  wfiInlineInput('강도', 'strength', 'preset', 'flex-none'),
  wfiInlineInput('노이즈', 'noise', 'preset', 'flex-none'),
  wfiInlineInput('프롬프트', 'prompt', 'preset', 'flex-1'),
  wfiInlineInput('네거티브 프롬프트', 'uc', 'preset', 'flex-1'),
  wfiInlineInput('캐릭터 프롬프트', 'characterPrompts', 'preset', 'flex-none'),
  wfiGroup('샘플링 설정', [
    wfiPush('top'),
    wfiInlineInput('스탭 수', 'steps', 'preset', 'flex-none'),
    wfiInlineInput(
      '프롬프트 가이던스',
      'promptGuidance',
      'preset',
      'flex-none',
    ),
    wfiInlineInput('샘플링', 'sampling', 'preset', 'flex-none'),
    wfiInlineInput('노이즈 스케줄', 'noiseSchedule', 'preset', 'flex-none'),
    wfiInlineInput('CFG 리스케일', 'cfgRescale', 'preset', 'flex-none'),
    wfiInlineInput('캐릭터 위치 지정', 'useCoords', 'preset', 'flex-none'),
    wfiInlineInput(
      'Legacy Prompt Conditioning 모드',
      'legacyPromptConditioning',
      'preset',
      'flex-none',
    ),
    wfiInlineInput(
      '바이브 강도 정규화',
      'normalizeStrength',
      'preset',
      'flex-none',
    ),
    wfiInlineInput('Variety+', 'varietyPlus', 'preset', 'flex-none'),
  ]),
  wfiInlineInput('바이브 설정', 'vibes', 'preset', 'flex-none'),
  wfiInlineInput('캐릭터 레퍼런스', 'characterReferences', 'preset', 'flex-none'),
  // wfiInlineInput('시드', 'seed', true, 'flex-none'),
]);

export function createI2IPreset(
  job: SDAbstractJob<string>,
  image?: string,
  mask?: string,
): any {
  const preset = workFlowService.buildPreset('SDI2I');
  preset.image = image;
  preset.mask = mask;
  preset.cfgRescale = job.cfgRescale;
  preset.promptGuidance = job.promptGuidance;
  preset.sampling = job.sampling;
  preset.noiseSchedule = job.noiseSchedule;
  preset.prompt = job.prompt;
  preset.uc = job.uc;
  preset.characterPrompts = job.characterPrompts;
  preset.useCoords = job.useCoords;
  preset.legacyPromptConditioning = job.legacyPromptConditioning;
  preset.normalizeStrength = job.normalizeStrength;
  preset.varietyPlus = job.varietyPlus;
  preset.characterPrompts = job.characterPrompts;
  return preset;
}

export const SDI2IDef = new WFDefBuilder('SDI2I')
  .setTitle('이미지 투 이미지')
  .setBackendType('image')
  .setEmoji('🔄')
  .setI2I(true)
  .setPresetVars(SDI2IPreset.build())
  .setSharedVars(new WFVarBuilder().build())
  .setEditor(SDI2IUI)
  .setHandler(createSDI2IHandler('SDI2I'))
  .setCreatePreset(createI2IPreset)
  .build();
