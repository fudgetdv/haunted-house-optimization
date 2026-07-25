import * as THREE from 'three'
import type {
    IFloorTexture,
    FloorTextureFactory,
    FloorTextureFactoryOptions,
} from './IFloorTexture'
import { repeatFromPlane } from './wallTexture'

/**
 * Paths for the mossy-rock floor PBR maps (served from static/).
 * Same set used by haunted-house-optimization:
 *   - alpha → soft circular edge mask
 *   - diff  → albedo / base color
 *   - arm   → packed AO + Roughness + Metalness
 *   - nor_gl → OpenGL-style normal map
 *   - disp  → displacement / height
 */
const FLOOR_ALPHA = './floor/alpha.jpg'
const FLOOR_BASE = './floor/mossy_rock_1k'
const FLOOR_DIFF = `${FLOOR_BASE}/mossy_rock_diff_1k.jpg`
const FLOOR_ARM = `${FLOOR_BASE}/mossy_rock_arm_1k.jpg`
const FLOOR_NORMAL = `${FLOOR_BASE}/mossy_rock_nor_gl_1k.jpg`
const FLOOR_DISP = `${FLOOR_BASE}/mossy_rock_disp_1k.jpg`

/** Default world units per square map stamp (rock scale). */
const DEFAULT_TILE_SIZE = 5
const DEFAULT_DISPLACEMENT_SCALE = 0.2
const DEFAULT_DISPLACEMENT_BIAS = -0.24

/**
 * Loads and configures the mossy-rock floor textures, and builds a
 * MeshStandardMaterial ready to drop onto the floor plane.
 *
 * Mirrors the floor setup from haunted-house-optimization:
 * color (sRGB) + ARM + normal + displacement + optional alpha edge.
 *
 * Prefer passing plane `width` + `height` so repeat is derived with correct
 * aspect. Use a subdivided PlaneGeometry (e.g. 64+ segments) if you want
 * displacement to show.
 */
export class FloorTexture implements IFloorTexture {
    readonly alpha: THREE.Texture
    readonly color: THREE.Texture
    readonly arm: THREE.Texture
    readonly normal: THREE.Texture
    readonly displacement: THREE.Texture
    readonly material: THREE.MeshStandardMaterial

    private readonly loader: THREE.TextureLoader
    private tileSize: number
    private readonly maps: THREE.Texture[]

    constructor(options: FloorTextureFactoryOptions = {}) {
        this.loader = options.loader ?? new THREE.TextureLoader()
        this.tileSize = options.tileSize ?? DEFAULT_TILE_SIZE

        this.alpha = this.loader.load(FLOOR_ALPHA)
        this.color = this.loader.load(FLOOR_DIFF)
        this.arm = this.loader.load(FLOOR_ARM)
        this.normal = this.loader.load(FLOOR_NORMAL)
        this.displacement = this.loader.load(FLOOR_DISP)

        // Albedo is color data → sRGB. Others stay linear (default).
        this.color.colorSpace = THREE.SRGBColorSpace

        // Alpha is a mask — no tiling (one soft circle over the plane)
        this.maps = [this.color, this.arm, this.normal, this.displacement]
        for (const map of this.maps) {
            map.wrapS = THREE.RepeatWrapping
            map.wrapT = THREE.RepeatWrapping
        }

        const [rx, ry] = this.resolveRepeat(options)
        this.applyRepeat(rx, ry)

        const useAlpha = options.useAlpha !== false

        this.material = new THREE.MeshStandardMaterial({
            map: this.color,
            aoMap: this.arm,
            roughnessMap: this.arm,
            metalnessMap: this.arm,
            normalMap: this.normal,
            displacementMap: this.displacement,
            displacementScale:
                options.displacementScale ?? DEFAULT_DISPLACEMENT_SCALE,
            displacementBias:
                options.displacementBias ?? DEFAULT_DISPLACEMENT_BIAS,
            ...(useAlpha
                ? {
                      alphaMap: this.alpha,
                      transparent: true,
                  }
                : {}),
        })
    }

    /**
     * Change tiling on the tiled PBR maps (not the alpha mask).
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
     * Free GPU resources when the floor material is no longer needed.
     */
    dispose(): void {
        this.material.dispose()
        this.alpha.dispose()
        this.color.dispose()
        this.arm.dispose()
        this.normal.dispose()
        this.displacement.dispose()
    }

    private applyRepeat(x: number, y: number): void {
        for (const map of this.maps) {
            map.repeat.set(x, y)
        }
    }

    private resolveRepeat(options: FloorTextureFactoryOptions): [number, number] {
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

/** Default factory — swap this at the composition root for other implementations. */
export const createFloorTexture: FloorTextureFactory = (options) =>
    new FloorTexture(options)
