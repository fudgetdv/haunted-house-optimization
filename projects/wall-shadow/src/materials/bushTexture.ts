import * as THREE from 'three'
import type {
    IBushTexture,
    BushTextureFactory,
    BushTextureFactoryOptions,
} from './IBushTexture'

/**
 * Paths for forest-ground leaf PBR maps (served from static/).
 * Same set used by haunted-house-optimization.
 */
const BUSH_BASE = './bush/leaves_forest_ground_1k'
const BUSH_DIFF = `${BUSH_BASE}/leaves_forest_ground_diff_1k.jpg`
const BUSH_ARM = `${BUSH_BASE}/leaves_forest_ground_arm_1k.jpg`
const BUSH_NORMAL = `${BUSH_BASE}/leaves_forest_ground_nor_gl_1k.jpg`

const DEFAULT_REPEAT: [number, number] = [2, 1]
const DEFAULT_COLOR = '#ccffcc'

/**
 * Leaf PBR material for sphere “bushes” (haunted-house style).
 */
export class BushTexture implements IBushTexture {
    readonly color: THREE.Texture
    readonly arm: THREE.Texture
    readonly normal: THREE.Texture
    readonly material: THREE.MeshStandardMaterial

    private readonly maps: THREE.Texture[]

    constructor(options: BushTextureFactoryOptions = {}) {
        const loader = options.loader ?? new THREE.TextureLoader()

        this.color = loader.load(BUSH_DIFF)
        this.arm = loader.load(BUSH_ARM)
        this.normal = loader.load(BUSH_NORMAL)

        this.color.colorSpace = THREE.SRGBColorSpace

        this.maps = [this.color, this.arm, this.normal]
        for (const map of this.maps) {
            map.wrapS = THREE.RepeatWrapping
            map.wrapT = THREE.RepeatWrapping
        }

        const [rx, ry] = resolveRepeat(options.repeat)
        this.applyRepeat(rx, ry)

        this.material = new THREE.MeshStandardMaterial({
            color: options.color ?? DEFAULT_COLOR,
            map: this.color,
            aoMap: this.arm,
            roughnessMap: this.arm,
            metalnessMap: this.arm,
            normalMap: this.normal,
        })
    }

    setRepeat(x: number, y: number = x): void {
        this.applyRepeat(x, y)
    }

    dispose(): void {
        this.material.dispose()
        this.color.dispose()
        this.arm.dispose()
        this.normal.dispose()
    }

    private applyRepeat(x: number, y: number): void {
        for (const map of this.maps) {
            map.repeat.set(x, y)
        }
    }
}

function resolveRepeat(
    repeat?: THREE.Vector2 | [number, number]
): [number, number] {
    if (!repeat) return DEFAULT_REPEAT
    if (Array.isArray(repeat)) return [repeat[0], repeat[1]]
    return [repeat.x, repeat.y]
}

export const createBushTexture: BushTextureFactory = (options) =>
    new BushTexture(options)
