import * as THREE from 'three'
import type {
    IWallTexture,
    WallTextureFactory,
    WallTextureFactoryOptions,
} from './IWallTexture'

/**
 * Paths for the castle brick wall PBR maps (served from static/).
 * Same set used by haunted-house-optimization:
 *   - diff  → albedo / base color
 *   - arm   → packed AO + Roughness + Metalness
 *   - nor_gl → OpenGL-style normal map
 */
const WALL_BASE = './wall/castle_brick_broken_06_1k'
const WALL_DIFF = `${WALL_BASE}/castle_brick_broken_06_diff_1k.jpg`
const WALL_ARM = `${WALL_BASE}/castle_brick_broken_06_arm_1k.jpg`
const WALL_NORMAL = `${WALL_BASE}/castle_brick_broken_06_nor_gl_1k.jpg`

/** Default world units per square map stamp (brick scale). */
const DEFAULT_TILE_SIZE = 6

/**
 * Loads and configures the broken castle-brick wall textures, and builds a
 * MeshStandardMaterial ready to drop onto the wall plane.
 *
 * Mirrors the wall setup from haunted-house-optimization:
 * color (sRGB) + ARM (ao/roughness/metalness) + normal.
 *
 * Prefer passing plane `width` + `height` so repeat is derived with correct
 * aspect (square maps → equal world size on X and Y).
 */
export class WallTexture implements IWallTexture {
    readonly color: THREE.Texture
    readonly arm: THREE.Texture
    readonly normal: THREE.Texture
    readonly material: THREE.MeshStandardMaterial

    private readonly loader: THREE.TextureLoader
    private tileSize: number

    constructor(options: WallTextureFactoryOptions = {}) {
        this.loader = options.loader ?? new THREE.TextureLoader()
        this.tileSize = options.tileSize ?? DEFAULT_TILE_SIZE

        this.color = this.loader.load(WALL_DIFF)
        this.arm = this.loader.load(WALL_ARM)
        this.normal = this.loader.load(WALL_NORMAL)

        // Albedo is color data → sRGB. ARM and normals stay linear (default).
        this.color.colorSpace = THREE.SRGBColorSpace

        for (const map of [this.color, this.arm, this.normal]) {
            map.wrapS = THREE.RepeatWrapping
            map.wrapT = THREE.RepeatWrapping
        }

        const [rx, ry] = this.resolveRepeat(options)
        this.applyRepeat(rx, ry)

        this.material = new THREE.MeshStandardMaterial({
            map: this.color,
            aoMap: this.arm,
            roughnessMap: this.arm,
            metalnessMap: this.arm,
            normalMap: this.normal,
        })
    }

    /**
     * Change tiling on all maps (manual override).
     */
    setRepeat(x: number, y: number = x): void {
        this.applyRepeat(x, y)
    }

    /**
     * Fit maps to a plane: repeat = planeSize / tileSize on each axis.
     */
    setPlaneSize(width: number, height: number, tileSize?: number): void {
        if (tileSize !== undefined) {
            this.tileSize = tileSize
        }
        const [rx, ry] = repeatFromPlane(width, height, this.tileSize)
        this.applyRepeat(rx, ry)
    }

    /**
     * Free GPU resources when the wall material is no longer needed.
     */
    dispose(): void {
        this.material.dispose()
        this.color.dispose()
        this.arm.dispose()
        this.normal.dispose()
    }

    private applyRepeat(x: number, y: number): void {
        for (const map of [this.color, this.arm, this.normal]) {
            map.repeat.set(x, y)
        }
    }

    private resolveRepeat(options: WallTextureFactoryOptions): [number, number] {
        if (options.repeat) {
            if (Array.isArray(options.repeat)) {
                return [options.repeat[0], options.repeat[1]]
            }
            return [options.repeat.x, options.repeat.y]
        }

        const width = options.width ?? 1
        const height = options.height ?? 1
        return repeatFromPlane(width, height, this.tileSize)
    }
}

/**
 * Aspect-correct UV repeats for a square texture on a W×H plane.
 * Each stamp covers `tileSize` world units on both axes.
 */
export function repeatFromPlane(
    width: number,
    height: number,
    tileSize: number = DEFAULT_TILE_SIZE
): [number, number] {
    const size = Math.max(tileSize, 1e-6)
    return [width / size, height / size]
}

/** Default factory — swap this at the composition root for other implementations. */
export const createWallTexture: WallTextureFactory = (options) =>
    new WallTexture(options)
