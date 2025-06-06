import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FloatView } from './FloatView';
import SceneEditor from './SceneEditor';
import { FaEdit, FaPlus, FaRegCalendarTimes } from 'react-icons/fa';
import Tournament from './Tournament';
import ResultViewer from './ResultViewer';
import InPaintEditor from './InPaintEditor';
import { base64ToDataUri } from './BrushTool';
import { useDrag, useDrop } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';
import { useContextMenu } from 'react-contexify';
import SceneSelector from './SceneSelector';
import { v4 } from 'uuid';
import { ImageOptimizeMethod } from '../backend';
import {
  isMobile,
  gameService,
  sessionService,
  imageService,
  taskQueueService,
  backend,
  localAIService,
  zipService,
  workFlowService,
} from '../models';
import {
  getMainImage,
  dataUriToBase64,
  deleteImageFiles,
} from '../models/ImageService';
import { queueI2IWorkflow, queueWorkflow } from '../models/TaskQueueService';
import {
  GenericScene,
  ContextMenuType,
  Scene,
  InpaintScene,
  Session,
} from '../models/types';
import { extractPromptDataFromBase64 } from '../models/util';
import { appState, SceneSelectorItem } from '../models/AppService';
import { observer } from 'mobx-react-lite';
import { createInpaintPreset } from '../models/workflows/SDWorkFlow';
import { reaction } from 'mobx';
import { oneTimeFlowMap, oneTimeFlows } from '../models/workflows/OneTimeFlows';

interface SceneCellProps {
  scene: GenericScene;
  curSession: Session;
  cellSize: number;
  getImage: (scene: GenericScene) => Promise<string | null>;
  setDisplayScene?: (scene: GenericScene) => void;
  setEditingScene?: (scene: GenericScene) => void;
  moveScene?: (scene: GenericScene, index: number) => void;
  style?: React.CSSProperties;
}

export const SceneCell = observer(
  ({
    scene,
    getImage,
    setDisplayScene,
    moveScene,
    setEditingScene,
    curSession,
    cellSize,
    style,
  }: SceneCellProps) => {
    const { show, hideAll } = useContextMenu({
      id: ContextMenuType.Scene,
    });
    const [image, setImage] = useState<string | undefined>(undefined);
    let emoji = '';
    if (scene.type === 'inpaint') {
      const def = workFlowService.getDef(scene.workflowType);
      if (def) {
        emoji = def.emoji ?? '';
      }
    }

    const cellSizes = ['w-48 h-48', 'w-36 h-36 md:w-64 md:h-64', 'w-96 h-96'];
    const cellSizes2 = [
      'max-w-48 max-h-48',
      ' max-w-36 max-h-36 md:max-w-64 md:max-h-64',
      'max-w-96 max-h-96',
    ];
    const cellSizes3 = ['w-48', 'w-36 md:w-64', ' w-96'];

    const curIndex = curSession.getScenes(scene.type).indexOf(scene);
    const [{ isDragging }, drag, preview] = useDrag(
      () => ({
        type: 'scene',
        item: { scene, curIndex, getImage, curSession, cellSize },
        collect: (monitor) => {
          const diff = monitor.getDifferenceFromInitialOffset();
          if (diff) {
            const dist = Math.sqrt(diff.x ** 2 + diff.y ** 2);
            if (dist > 20) {
              hideAll();
            }
          }
          return {
            isDragging: monitor.isDragging(),
          };
        },
        end: (item, monitor) => {
          // if (!isMobile) return;
          const { scene: droppedScene, curIndex: droppedIndex } = item;
          const didDrop = monitor.didDrop();
          if (!didDrop) {
            moveScene!(droppedScene, droppedIndex);
          }
        },
      }),
      [curIndex, scene, cellSize],
    );

    useEffect(() => {
      preview(getEmptyImage(), { captureDraggingState: true });
    }, [preview]);

    const [{ isOver }, drop] = useDrop<any, any, any>(
      () => ({
        accept: 'scene',
        canDrop: () => true,
        collect: (monitor) => {
          if (monitor.isOver()) {
            return {
              isOver: true,
            };
          }
          return { isOver: false };
        },
        hover({
          scene: draggedScene,
          curIndex: draggedIndex,
        }: {
          scene: GenericScene;
          curIndex: number;
        }) {},
        drop: (item: any, monitor) => {
          if (!isMobile || true) {
            const { scene: droppedScene, curIndex: droppedIndex } = item;
            const overIndex = curSession.getScenes(scene.type).indexOf(scene);
            moveScene!(droppedScene, overIndex);
          }
        },
      }),
      [moveScene],
    );

    const addToQueue = async (scene: GenericScene) => {
      try {
        if (scene.type === 'scene') {
          await queueWorkflow(
            curSession,
            appState.curSession?.selectedWorkflow!,
            scene,
            appState.samples,
          );
        } else {
          await queueI2IWorkflow(
            curSession,
            scene.workflowType,
            scene.preset,
            scene,
            appState.samples,
          );
        }
      } catch (e: any) {
        appState.pushMessage('프롬프트 에러: ' + e.message);
      }
    };

    const [_, rerender] = useState<{}>({});

    const removeFromQueue = (scene: GenericScene) => {
      taskQueueService.removeTasksFromScene(scene);
    };

    const getSceneQueueCount = (scene: GenericScene) => {
      const stats = taskQueueService.statsTasksFromScene(curSession!, scene);
      return stats.total - stats.done;
    };

    useEffect(() => {
      const onUpdate = () => {
        rerender({});
      };
      const refreshImage = async () => {
        try {
          const base64 = await getImage(scene);
          setImage(base64!);
        } catch (e: any) {
          setImage(undefined);
        }
        rerender({});
      };
      refreshImage();
      gameService.addEventListener('updated', refreshImage);
      taskQueueService.addEventListener('progress', onUpdate);
      imageService.addEventListener('image-cache-invalidated', refreshImage);
      const dispose = reaction(
        () => scene.mains.join(''),
        () => {
          refreshImage();
        },
      );
      const dispose2 = reaction(
        () => scene.type === 'inpaint' && scene.preset.image,
        () => {
          refreshImage();
        },
      );
      return () => {
        gameService.removeEventListener('updated', refreshImage);
        taskQueueService.removeEventListener('progress', onUpdate);
        imageService.removeEventListener(
          'image-cache-invalidated',
          refreshImage,
        );
        dispose();
        dispose2();
      };
    }, [scene]);

    return (
      <div
        className={
          'relative m-2 p-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-500 ' +
          (isDragging ? 'opacity-0 no-touch ' : '') +
          (isOver ? ' outline outline-sky-500' : '')
        }
        style={style}
        ref={(node) => drag(drop(node))}
        onContextMenu={(e) => {
          show({
            event: e,
            props: {
              ctx: {
                type: 'scene',
                scene: scene,
              },
            },
          });
        }}
      >
        {getSceneQueueCount(scene) > 0 && (
          <span className="absolute right-0 bg-yellow-400 dark:bg-indigo-400 inline-block mr-3 px-2 py-1 text-center align-middle rounded-md font-bold text-white">
            {getSceneQueueCount(scene)}
          </span>
        )}
        <div
          className="-z-10 clickable bg-white dark:bg-slate-800"
          onClick={(event) => {
            if (isDragging) return;
            setDisplayScene?.(scene);
          }}
        >
          <div
            className={'p-2 flex text-lg text-default ' + cellSizes3[cellSize]}
          >
            <div className="truncate flex-1">
              {emoji}
              {scene.name}
            </div>
            <div className="flex-none text-gray-400">
              {gameService.getOutputs(curSession!, scene).length}{' '}
            </div>
          </div>
          <div
            className={
              'relative image-cell flex-none overflow-hidden ' +
              cellSizes[cellSize]
            }
          >
            {image && (
              <img
                src={image}
                draggable={false}
                className={
                  'w-auto h-auto object-scale-down z-0 bg-checkboard ' +
                  cellSizes2[cellSize]
                }
              />
            )}
          </div>
        </div>
        <div className="w-full flex mt-auto justify-center items-center gap-2 p-2">
          <button
            className={`round-button back-green`}
            onClick={(e) => {
              e.stopPropagation();
              addToQueue(scene);
            }}
          >
            <FaPlus />
          </button>
          <button
            className={`round-button back-gray`}
            onClick={(e) => {
              e.stopPropagation();
              removeFromQueue(scene);
            }}
          >
            <FaRegCalendarTimes />
          </button>
          <button
            className={`round-button back-orange`}
            onClick={(e) => {
              e.stopPropagation();
              setEditingScene?.(scene);
            }}
          >
            <FaEdit />
          </button>
        </div>
      </div>
    );
  },
);

interface QueueControlProps {
  type: 'scene' | 'inpaint';
  filterFunc?: (scene: GenericScene) => boolean;
  onClose?: (x: number) => void;
  showPannel?: boolean;
  className?: string;
}

const QueueControl = observer(
  ({ type, className, showPannel, filterFunc, onClose }: QueueControlProps) => {
    const curSession = appState.curSession!;
    const [_, rerender] = useState<{}>({});
    const [editingScene, setEditingScene] = useState<GenericScene | undefined>(
      undefined,
    );
    const [inpaintEditScene, setInpaintEditScene] = useState<
      InpaintScene | undefined
    >(undefined);
    const [displayScene, setDisplayScene] = useState<GenericScene | undefined>(
      undefined,
    );
    const [cellSize, setCellSize] = useState(1);
    useEffect(() => {
      const onProgressUpdated = () => {
        rerender({});
      };
      taskQueueService.addEventListener('progress', onProgressUpdated);
      return () => {
        taskQueueService.removeEventListener('progress', onProgressUpdated);
      };
    }, []);
    useEffect(() => {
      imageService.refreshBatch(curSession!);
    }, [curSession]);
    const addAllToQueue = async () => {
      try {
        for (const scene of curSession.getScenes(type)) {
          if (scene.type === 'scene') {
            await queueWorkflow(
              curSession,
              curSession.selectedWorkflow!,
              scene,
              appState.samples,
            );
          } else {
            await queueI2IWorkflow(
              curSession,
              scene.workflowType,
              scene.preset,
              scene,
              appState.samples,
            );
          }
        }
      } catch (e: any) {
        appState.pushMessage('프롬프트 에러: ' + e.message);
      }
    };
    const addScene = () => {
      appState.pushDialog({
        type: 'input-confirm',
        text: '신규 씬 이름을 입력해주세요',
        callback: async (inputValue) => {
          if (inputValue) {
            const scenes = curSession.getScenes(type);
            if (scenes.find((x) => x.name === inputValue)) {
              appState.pushMessage('이미 존재하는 씬 이름입니다.');
              return;
            }

            if (type === 'scene') {
              curSession.addScene(
                Scene.fromJSON({
                  type: 'scene',
                  name: inputValue,
                  resolution: 'portrait',
                  slots: [
                    [
                      {
                        id: v4(),
                        prompt: '',
                        characterPrompts: [],
                        enabled: true,
                      },
                    ],
                  ],
                  mains: [],
                  imageMap: [],
                  meta: {},
                  round: undefined,
                  game: undefined,
                }),
              );
            } else {
              const menu = await appState.pushDialogAsync({
                type: 'select',
                text: '이미지 변형 방법을 선택해주세요',
                items: workFlowService.i2iFlows.map((x) => ({
                  text: (x.def.emoji ?? '') + x.def.title,
                  value: x.getType(),
                })),
              });
              if (!menu) return;
              curSession.addScene(
                InpaintScene.fromJSON({
                  type: 'inpaint',
                  name: inputValue,
                  resolution: 'portrait',
                  workflowType: menu,
                  preset: workFlowService.buildPreset(menu).toJSON(),
                  mains: [],
                  imageMap: [],
                  round: undefined,
                  game: undefined,
                }),
              );
            }
          }
        },
      });
    };

    const getImage = async (scene: GenericScene) => {
      if (scene.type === 'scene') {
        const image = await getMainImage(curSession!, scene as Scene, 500);
        if (!image) throw new Error('No image available');
        return image;
      } else {
        return await imageService.fetchVibeImage(
          curSession!,
          scene.preset.image,
        );
      }
    };

    const cellSizes = ['스몰뷰', '미디엄뷰', '라지뷰'];

    const favButton = {
      text: (path: string) => {
        return isMainImage(path) ? '즐겨찾기 해제' : '즐겨찾기 지정';
      },
      className: 'back-orange',
      onClick: async (scene: Scene, path: string, close: () => void) => {
        const filename = path.split('/').pop()!;
        if (isMainImage(path)) {
          scene.mains = scene.mains.filter((x) => x !== filename);
        } else {
          scene.mains.push(filename);
        }
      },
    };

    const createInpaintScene = async (
      scene: GenericScene,
      workflowType: string,
      path: string,
      close: () => void,
    ) => {
      let image = await imageService.fetchImage(path);
      image = dataUriToBase64(image!);
      let cnt = 0;
      const newName = () => scene.name + cnt.toString();
      while (curSession!.inpaints.has(newName())) {
        cnt++;
      }
      const name = newName();
      const job = await extractPromptDataFromBase64(image);
      const preset = job
        ? workFlowService.createPreset(workflowType, job)
        : workFlowService.buildPreset(workflowType);
      preset.image = await imageService.storeVibeImage(curSession!, image);
      const newScene = InpaintScene.fromJSON({
        type: 'inpaint',
        name: name,
        workflowType: workflowType,
        preset,
        resolution: scene.resolution,
        sceneRef: scene.type === 'scene' ? scene.name : undefined,
        imageMap: [],
        mains: [],
        round: undefined,
        game: undefined,
      });
      curSession!.addScene(newScene);
      close();
      setInpaintEditScene(newScene);
    };

    const buttons: any =
      type === 'scene'
        ? [
            favButton,
            {
              text: '인페인팅 씬 생성',
              className: 'back-green',
              onClick: async (
                scene: Scene,
                path: string,
                close: () => void,
              ) => {
                await createInpaintScene(scene, 'SDInpaint', path, close);
              },
            },
          ]
        : [
            favButton,
            {
              text: '해당 이미지로 인페인트',
              className: 'back-orange',
              onClick: async (
                scene: InpaintScene,
                path: string,
                close: () => void,
              ) => {
                let image = await imageService.fetchImage(path);
                image = dataUriToBase64(image!);
                await imageService.writeVibeImage(
                  curSession!,
                  scene.preset.image,
                  image,
                );
                close();
                setInpaintEditScene(scene as InpaintScene);
              },
            },
            {
              text: '원본 씬으로 이미지 복사',
              className: 'back-green',
              onClick: async (
                scene: InpaintScene,
                path: string,
                close: () => void,
              ) => {
                if (!scene.sceneRef) {
                  appState.pushMessage('원본 씬이 없습니다.');
                  return;
                }
                const orgScene = curSession!.scenes.get(scene.sceneRef);
                if (!orgScene) {
                  appState.pushMessage('원본 씬이 삭제되었거나 이동했습니다.');
                  return;
                }
                await backend.copyFile(
                  path,
                  imageService.getImageDir(curSession!, orgScene) +
                    '/' +
                    Date.now().toString() +
                    '.png',
                );
                imageService.refresh(curSession!, orgScene);
                setDisplayScene(undefined);
                if (onClose) onClose(0);
                close();
              },
            },
          ];
    buttons.push({
      text: '이미지 변형',
      className: 'back-gray',
      // @ts-ignore
      onClick: async (scene: Scene, path: string, close: () => void) => {
        const menu = await appState.pushDialogAsync({
          type: 'select',
          text: '이미지 변형 방법을 선택해주세요',
          items: [
            {
              text: '이미지 변형 씬 생성',
              value: 'create',
            },
          ].concat(
            oneTimeFlows.map((x) => ({
              text: x.text,
              value: x.text,
            })),
          ),
        });
        if (!menu) return;
        if (menu === 'create') {
          const flows = workFlowService.i2iFlows;
          const items = flows.map((x) => ({
            text: (x.def.emoji ?? '') + x.def.title,
            value: x.getType(),
          }));
          const method = await appState.pushDialogAsync({
            type: 'select',
            text: '변형 씬에서 사용할 방법을 선택해주세요',
            items: items,
          });
          if (!method) return;
          await createInpaintScene(scene, method, path, close);
        } else {
          let image = await imageService.fetchImage(path);
          image = dataUriToBase64(image!);
          const job = await extractPromptDataFromBase64(image);
          const menuItem = oneTimeFlowMap.get(menu)!;
          const input = menuItem.getInput
            ? await menuItem.getInput(curSession!)
            : undefined;
          menuItem.handler(curSession!, scene, image, undefined, job, input);
        }
      },
    });

    const [adding, setAdding] = useState<boolean>(false);
    const panel = useMemo(() => {
      if (type === 'scene') {
        return (
          <>
            {inpaintEditScene && (
              <FloatView
                priority={3}
                onEscape={() => setInpaintEditScene(undefined)}
              >
                <InPaintEditor
                  editingScene={inpaintEditScene}
                  onConfirm={() => {
                    if (resultViewerRef.current)
                      resultViewerRef.current.setInpaintTab();
                    setInpaintEditScene(undefined);
                  }}
                  onDelete={() => {}}
                />
              </FloatView>
            )}
            {editingScene && (
              <FloatView
                priority={2}
                onEscape={() => setEditingScene(undefined)}
              >
                <SceneEditor
                  scene={editingScene as Scene}
                  onClosed={() => {
                    setEditingScene(undefined);
                  }}
                  onDeleted={() => {
                    if (showPannel) {
                      setDisplayScene(undefined);
                    }
                  }}
                />
              </FloatView>
            )}
          </>
        );
      } else {
        return (
          <>
            {inpaintEditScene && (
              <FloatView
                priority={3}
                onEscape={() => setInpaintEditScene(undefined)}
              >
                <InPaintEditor
                  editingScene={inpaintEditScene}
                  onConfirm={() => {
                    setInpaintEditScene(undefined);
                  }}
                  onDelete={() => {}}
                />
              </FloatView>
            )}
            {(editingScene || adding) && (
              <FloatView
                priority={2}
                onEscape={() => {
                  setEditingScene(undefined);
                  setAdding(false);
                }}
              >
                <InPaintEditor
                  editingScene={editingScene as InpaintScene}
                  onConfirm={() => {
                    setEditingScene(undefined);
                    setAdding(false);
                  }}
                  onDelete={() => {
                    setDisplayScene(undefined);
                  }}
                />
              </FloatView>
            )}
          </>
        );
      }
    }, [editingScene, inpaintEditScene, adding]);

    const onEdit = async (scene: GenericScene) => {
      setEditingScene(scene);
    };

    const isMainImage = (path: string) => {
      const filename = path.split('/').pop()!;
      return !!(displayScene && displayScene.mains.includes(filename));
    };

    const onFilenameChange = (src: string, dst: string) => {
      if (type === 'scene') {
        const scene = displayScene as Scene;
        src = src.split('/').pop()!;
        dst = dst.split('/').pop()!;
        if (scene.mains.includes(src) && !scene.mains.includes(dst)) {
          scene.mains = scene.mains.map((x) => (x === src ? dst : x));
        } else if (!scene.mains.includes(src) && scene.mains.includes(dst)) {
          scene.mains = scene.mains.map((x) => (x === dst ? src : x));
        }
      }
    };

    const resultViewerRef = useRef<any>(null);
    const resultViewer = useMemo(() => {
      if (displayScene)
        return (
          <FloatView
            priority={2}
            showToolbar
            onEscape={() => {
              gameService.refreshList(curSession!, displayScene);
              setDisplayScene(undefined);
            }}
          >
            <ResultViewer
              ref={resultViewerRef}
              scene={displayScene}
              isMainImage={isMainImage}
              onFilenameChange={onFilenameChange}
              onEdit={onEdit}
              buttons={buttons}
            />
          </FloatView>
        );
      return <></>;
    }, [displayScene]);

    const [sceneSelector, setSceneSelector] = useState<
      SceneSelectorItem | undefined
    >(undefined);

    const moveScene = (draggingScene: GenericScene, targetIndex: number) => {
      curSession!.moveScene(draggingScene, targetIndex);
    };

    return (
      <div className={'flex flex-col h-full ' + (className ?? '')}>
        {sceneSelector && (
          <FloatView priority={0} onEscape={() => setSceneSelector(undefined)}>
            <SceneSelector
              text={sceneSelector.text}
              scenes={curSession!.getScenes(type)}
              onConfirm={sceneSelector.callback}
              getImage={getImage}
            />
          </FloatView>
        )}
        {resultViewer}
        {panel}
        {!!showPannel && (
          <div className="flex flex-none pb-2">
            <div className="flex gap-1 md:gap-2">
              <button className={`round-button back-sky`} onClick={addScene}>
                씬 추가
              </button>
              <button
                className={`round-button back-sky`}
                onClick={addAllToQueue}
              >
                모두 예약추가
              </button>
              <button
                className={`round-button back-gray`}
                onClick={() => appState.exportPackage(type)}
              >
                {isMobile ? '' : '이미지 '}내보내기
              </button>
              <button
                className={`round-button back-gray`}
                onClick={() => {
                  appState.openBatchProcessMenu(type, setSceneSelector);
                }}
              >
                대량 작업
              </button>
            </div>
            <div className="ml-auto mr-2 hidden md:block">
              <button
                onClick={() => setCellSize((cellSize + 1) % 3)}
                className={`round-button back-gray`}
              >
                {cellSizes[cellSize]}
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-wrap overflow-auto justify-start items-start content-start">
            {curSession
              .getScenes(type)
              .filter((x) => {
                if (!filterFunc) return true;
                return filterFunc(x);
              })
              .map((scene) => (
                <SceneCell
                  cellSize={showPannel || isMobile ? cellSize : 2}
                  key={scene.name}
                  scene={scene}
                  getImage={getImage}
                  setDisplayScene={setDisplayScene}
                  setEditingScene={setEditingScene}
                  moveScene={moveScene}
                  curSession={curSession}
                />
              ))}
          </div>
        </div>
      </div>
    );
  },
);

export default QueueControl;
