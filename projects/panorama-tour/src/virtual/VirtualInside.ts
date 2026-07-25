import type * as THREE from 'three'
import {
    createPanoramaBox,
    type PanoramaCubeFaces,
} from '../meshes/panoramaBox'
import type { IVirtual } from './IVirtual'

export type VirtualInsideOptions = {
    /**
     * Six cube faces for an indoor room-style panorama.
     * Paths relative to static/, e.g. `./panorama/px.jpg`.
     */
    faces: PanoramaCubeFaces
    /** Cube edge length in world units. Default 40. */
    size?: number
    /**
     * Cube center. Default lifts the box so the floor face (ny) sits near y = 0.
     */
    position?: THREE.Vector3 | [number, number, number]
    /** Yaw the whole room (radians). Default 0. */
    rotationY?: number
    fallbackColor?: THREE.ColorRepresentation
    loader?: THREE.TextureLoader
}

/**
 * Indoor virtual environment: six-sided cube (walls + floor + ceiling).
 */
export class VirtualInside implements IVirtual {
    readonly kind = 'inside' as const
    readonly mesh: THREE.Object3D

    private readonly disposeImpl: () => void

    private constructor(mesh: THREE.Object3D, dispose: () => void) {
        this.mesh = mesh
        this.disposeImpl = dispose
    }

    static async create(options: VirtualInsideOptions): Promise<VirtualInside> {
        const size = options.size ?? 40
        const position = options.position ?? [0, size / 2, 0]

        const pano = await createPanoramaBox({
            mode: 'cube',
            size,
            faces: options.faces,
            position,
            rotationY: options.rotationY,
            fallbackColor: options.fallbackColor,
            loader: options.loader,
        })

        return new VirtualInside(pano.mesh, () => pano.dispose())
    }

    dispose(): void {
        this.disposeImpl()
    }
}

export const createVirtualInside = (options: VirtualInsideOptions) =>
    VirtualInside.create(options)
