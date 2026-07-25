import type * as THREE from 'three'

/**
 * Contract for wall appearance providers.
 * Inject this (not a concrete class) so maps, flat colors, or stubs can be swapped.
 */
export interface IWallTexture {
    /** Material applied to wall meshes. */
    readonly material: THREE.Material

    /**
     * Tile maps (or no-op for non-textured implementations).
     * @param y defaults to x when omitted
     */
    setRepeat(x: number, y?: number): void

    /**
     * Recompute repeat from plane size so square maps stay unstretched.
     * `tileSize` = world units covered by one map stamp on both axes.
     */
    setPlaneSize(width: number, height: number, tileSize?: number): void

    /** Free GPU resources when the wall is no longer needed. */
    dispose(): void
}

/**
 * Factory signature for DI containers / composition roots.
 * Pass a different factory to swap the concrete wall look.
 */
export type WallTextureFactory = (
    options?: WallTextureFactoryOptions
) => IWallTexture

/** Shared options any factory may accept (concrete classes may ignore extras). */
export type WallTextureFactoryOptions = {
    /**
     * Plane width in world units (matches PlaneGeometry first arg).
     * Used with `height` + `tileSize` to derive aspect-correct repeat.
     */
    width?: number
    /**
     * Plane height in world units (matches PlaneGeometry second arg).
     */
    height?: number
    /**
     * World units covered by one square texture stamp on both axes.
     * Larger = fewer, bigger bricks. Default: 6.
     */
    tileSize?: number
    /**
     * Manual UV repeat override. When set, skips plane-based calculation.
     */
    repeat?: THREE.Vector2 | [number, number]
    /** Optional shared TextureLoader. */
    loader?: THREE.TextureLoader
}
