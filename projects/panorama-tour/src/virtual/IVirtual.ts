import type * as THREE from 'three'

/**
 * Swappable virtual environment (outside 360 sphere or inside cube room).
 * Composition root depends on this interface, not a concrete class.
 */
export interface IVirtual {
    /** Environment mesh to add to the scene. */
    readonly mesh: THREE.Object3D

    /** Discriminator for debugging / UI. */
    readonly kind: 'outside' | 'inside'

    /** Free GPU resources. */
    dispose: () => void
}

/**
 * Factory signature for DI — swap Outside ↔ Inside at the composition root.
 */
export type VirtualFactory = () => Promise<IVirtual>
