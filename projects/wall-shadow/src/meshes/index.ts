/**
 * Scene mesh builders / controllers (geometry + placement).
 * Materials live under `../materials/`.
 */
export { createBushes, generateBushInstances } from './bushes'
export type {
    BushInstance,
    BushesOptions,
    BushesController,
    WallAnchor,
    AlongLayout,
    SidesLayout,
} from './bushes'

export { createSilhouette, buildFromPng } from './silhouette'
export type {
    SilhouetteController,
    SilhouetteOptions,
    SilhouetteUpdateParams,
} from './silhouette'

export {
    VampirePoses,
    createVampirePoses,
    resolveWallPosition,
    clampWallX,
} from './vampirePoses'
export type {
    VampirePosesOptions,
    VampirePoseOffset,
    WallPosition,
    WallUvPosition,
    WallXyzPosition,
    WallSize,
    ResolvedWallPosition,
} from './vampirePoses'
