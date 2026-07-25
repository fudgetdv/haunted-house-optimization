import type * as THREE from 'three'
import { createPanoramaBox } from '../meshes/panoramaBox'
import type { IVirtual } from './IVirtual'

export type VirtualOutsideOptions = {
    /**
     * Single 360° equirectangular photo (outdoor / open world).
     * e.g. `./panorama/panaroma_1.jpg`
     */
    textureUrl: string
    /** Sphere diameter in world units. Default 40. */
    size?: number
    /**
     * Sphere center. Default [0, eyeHeight, 0] so the horizon sits near eye level.
     */
    position?: THREE.Vector3 | [number, number, number]
    /**
     * Horizontal mirror. Default true (fixes inside-view mirror).
     * Set false if left/right already look correct.
     */
    flipX?: boolean
    /** Vertical mirror. Default false. */
    flipY?: boolean
    /** Yaw the whole world (radians). Default 0. */
    rotationY?: number
    /** Used to place the default sphere center. Default 1.6. */
    eyeHeight?: number
    fallbackColor?: THREE.ColorRepresentation
    loader?: THREE.TextureLoader
}

/**
 * Outdoor / open virtual environment: equirectangular photo on a sphere.
 */
export class VirtualOutside implements IVirtual {
    readonly kind = 'outside' as const
    readonly mesh: THREE.Object3D

    private readonly disposeImpl: () => void

    private constructor(mesh: THREE.Object3D, dispose: () => void) {
        this.mesh = mesh
        this.disposeImpl = dispose
    }

    static async create(options: VirtualOutsideOptions): Promise<VirtualOutside> {
        const eyeHeight = options.eyeHeight ?? 1.6
        const size = options.size ?? 40

        const pano = await createPanoramaBox({
            mode: 'equirect',
            size,
            textureUrl: options.textureUrl,
            position: options.position ?? [0, eyeHeight, 0],
            flipX: options.flipX,
            flipY: options.flipY,
            rotationY: options.rotationY,
            fallbackColor: options.fallbackColor,
            loader: options.loader,
        })

        return new VirtualOutside(pano.mesh, () => pano.dispose())
    }

    dispose(): void {
        this.disposeImpl()
    }
}

export const createVirtualOutside = (options: VirtualOutsideOptions) =>
    VirtualOutside.create(options)
