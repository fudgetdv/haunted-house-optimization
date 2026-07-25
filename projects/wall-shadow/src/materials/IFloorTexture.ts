import type * as THREE from 'three'

/**
 * Contract for floor appearance providers.
 * Inject this (not a concrete class) so maps, flat colors, or stubs can be swapped.
 */
export interface IFloorTexture {
    /** Material applied to floor meshes. */
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

    /** Free GPU resources when the floor material is no longer needed. */
    dispose(): void
}

/**
 * Factory signature for DI containers / composition roots.
 * Pass a different factory to swap the concrete floor look.
 */
export type FloorTextureFactory = (
    options?: FloorTextureFactoryOptions
) => IFloorTexture

/** Shared options any factory may accept (concrete classes may ignore extras). */
export type FloorTextureFactoryOptions = {
    /**
     * Plane width in world units (matches PlaneGeometry first arg).
     * Used with `height` + `tileSize` to derive aspect-correct repeat.
     */
    width?: number
    /**
     * Plane height / depth in world units (matches PlaneGeometry second arg).
     */
    height?: number
    /**
     * World units covered by one square texture stamp on both axes.
     * Larger = fewer, bigger rocks. Default: 5
     * (matches haunted-house: 40×40 plane @ repeat 8 → tileSize 5).
     */
    tileSize?: number
    /**
     * Manual UV repeat override. When set, skips plane-based calculation.
     */
    repeat?: THREE.Vector2 | [number, number]
    /** Displacement strength. Default: 0.2 (haunted-house). */
    displacementScale?: number
    /** Displacement bias. Default: -0.24 (haunted-house). */
    displacementBias?: number
    /**
     * Soft circular edge via alpha map. Default: true.
     * Set false for a full rectangular floor.
     */
    useAlpha?: boolean
    /** Optional shared TextureLoader. */
    loader?: THREE.TextureLoader
}
