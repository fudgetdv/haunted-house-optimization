import type * as THREE from 'three'

/**
 * Contract for bush leaf appearance providers.
 * Inject this so leaf maps or flat greens can be swapped.
 */
export interface IBushTexture {
    readonly material: THREE.Material
    setRepeat(x: number, y?: number): void
    dispose(): void
}

export type BushTextureFactory = (
    options?: BushTextureFactoryOptions
) => IBushTexture

export type BushTextureFactoryOptions = {
    /** UV repeat on leaf maps. Default [2, 1] (haunted-house). */
    repeat?: THREE.Vector2 | [number, number]
    /** Multiplies albedo (original used a light green tint). Default '#ccffcc'. */
    color?: THREE.ColorRepresentation
    loader?: THREE.TextureLoader
}
