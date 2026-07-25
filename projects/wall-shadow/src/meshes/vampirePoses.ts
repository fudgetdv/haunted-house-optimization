import * as THREE from 'three'
import {
    buildFromPng,
    setSilhouetteOpacity,
    type SilhouetteController,
    type SilhouetteUpdateParams,
} from './silhouette'

/** Wall-local meters (origin = wall center). */
export type WallXyzPosition = {
    x: number
    y: number
    z?: number
}

/**
 * Normalized wall position: u,v in 0–1
 * (0,0) = bottom-left, (1,1) = top-right, (0.5,0.5) = center.
 */
export type WallUvPosition = {
    u: number
    v: number
    z?: number
}

export type WallPosition = WallXyzPosition | WallUvPosition

export type WallSize = {
    width: number
    height: number
}

/** @deprecated Prefer WallPosition — kept as alias for older offset fields. */
export type VampirePoseOffset = WallXyzPosition

export type VampirePosesOptions = {
    wall: THREE.Mesh
    /**
     * Wall plane size in world units (matches PlaneGeometry).
     * Required for UV positions; also used to clamp edges.
     * Default { width: 20, height: 12 }.
     */
    wallSize?: WallSize

    /** Pose A image. Default: silhoutte_A.png */
    poseAUrl?: string
    /** Pose B image. Default: silhoutte_B.png */
    poseBUrl?: string

    /** Overall group scale on the wall. Default 1.2. */
    scale?: number
    /** Target height of each pose plane. Default 6. */
    height?: number

    /**
     * Where pose A appears (wall-local xyz or uv).
     * Legacy alias: `offset`.
     */
    position?: WallPosition
    /** @deprecated Use `position`. */
    offset?: WallPosition

    /**
     * Absolute wall position for pose B.
     * If omitted, uses `position` + `poseBOffset`.
     */
    poseBPosition?: WallPosition
    /**
     * Added to pose A position to get pose B when `poseBPosition` is omitted.
     * Default { x: 1.5, y: 0.1, z: 0 } — noticeable step during flash.
     */
    poseBOffset?: WallXyzPosition

    /**
     * Named / freeform strike homes. When `relocateEachStrike` is true,
     * each lightning picks one slot as the base for that flash.
     * Pose A = slot; pose B = slot + poseBOffset (or absolute poseBPosition if set per strike base).
     */
    slots?: WallPosition[]
    /** Pick a new slot every lightning strike. Default false. */
    relocateEachStrike?: boolean

    /**
     * Keep |x| ≤ this so the figure stays out of end bushes.
     * Default 5 (matches a clear center ~10 wide on a 20 wall).
     * Set to Infinity / large number to disable.
     */
    maxAbsX?: number

    /**
     * Seconds after a strike starts before swapping A → B.
     * Default 0.12 (double-flash).
     */
    swapAfter?: number
    /** Min exposure to show the vampire. Default 0.01. */
    exposureThreshold?: number
}

const DEFAULT_WALL_SIZE: WallSize = { width: 20, height: 12 }

const DEFAULT_OPTIONS = {
    poseAUrl: '../assets/vampire_nosferatu_silhoutte_A.png',
    poseBUrl: '../assets/vampire_nosferatu_silhoutte_B.png',
    scale: 1.2,
    height: 6,
    wallSize: DEFAULT_WALL_SIZE,
    position: { u: 0.45, v: 0.4 } satisfies WallPosition,
    poseBOffset: { x: 1.5, y: 0.1, z: 0 } satisfies WallXyzPosition,
    slots: [
        { u: 0.35, v: 0.4 },
        { u: 0.5, v: 0.38 },
        { u: 0.65, v: 0.4 },
    ] satisfies WallPosition[],
    relocateEachStrike: true,
    maxAbsX: 5,
    swapAfter: 0.12,
    exposureThreshold: 0.01,
}

export type ResolvedWallPosition = {
    x: number
    y: number
    z: number
}

function isUvPosition(pos: WallPosition): pos is WallUvPosition {
    return 'u' in pos && typeof (pos as WallUvPosition).u === 'number'
}

/**
 * Convert UV or xyz into wall-local meters (origin = wall center).
 */
export function resolveWallPosition(
    pos: WallPosition,
    wallSize: WallSize = DEFAULT_WALL_SIZE
): ResolvedWallPosition {
    const z = pos.z ?? 0.01

    if (isUvPosition(pos)) {
        return {
            x: (pos.u - 0.5) * wallSize.width,
            y: (pos.v - 0.5) * wallSize.height,
            z,
        }
    }

    return { x: pos.x, y: pos.y, z }
}

/**
 * Clamp horizontal placement so the silhouette stays in the clear center band.
 */
export function clampWallX(
    pos: ResolvedWallPosition,
    maxAbsX: number
): ResolvedWallPosition {
    if (!Number.isFinite(maxAbsX) || maxAbsX <= 0) {
        return pos
    }

    return {
        ...pos,
        x: Math.min(maxAbsX, Math.max(-maxAbsX, pos.x)),
    }
}

function addOffset(
    base: ResolvedWallPosition,
    offset: WallXyzPosition
): ResolvedWallPosition {
    return {
        x: base.x + offset.x,
        y: base.y + offset.y,
        z: base.z + (offset.z ?? 0),
    }
}

/**
 * Two-pose vampire on the wall: image A→B and optional area change on lightning.
 * Implements SilhouetteController for ReplayController.
 */
export class VampirePoses implements SilhouetteController {
    readonly group: THREE.Group

    private readonly poseA: THREE.Object3D
    private readonly poseB: THREE.Object3D
    private readonly baseScale: THREE.Vector3
    private readonly swapAfter: number
    private readonly exposureThreshold: number
    private readonly usedFallbackPoseB: boolean
    private readonly wallSize: WallSize
    private readonly maxAbsX: number
    private readonly relocateEachStrike: boolean
    private readonly slots: WallPosition[]
    private readonly defaultHome: WallPosition
    private readonly poseBPosition: WallPosition | undefined
    private readonly poseBOffset: WallXyzPosition

    private flashActive = false
    private flashAge = 0
    private activePose: 0 | 1 = 0
    /** Resolved wall-local home for the current strike (pose A). */
    private strikeHome: ResolvedWallPosition
    /** Resolved wall-local position for pose B this strike. */
    private strikePoseB: ResolvedWallPosition

    private constructor(
        group: THREE.Group,
        poseA: THREE.Object3D,
        poseB: THREE.Object3D,
        config: {
            swapAfter: number
            exposureThreshold: number
            wallSize: WallSize
            maxAbsX: number
            relocateEachStrike: boolean
            slots: WallPosition[]
            defaultHome: WallPosition
            poseBPosition?: WallPosition
            poseBOffset: WallXyzPosition
            scale: number
        },
        usedFallbackPoseB: boolean
    ) {
        this.group = group
        this.poseA = poseA
        this.poseB = poseB
        this.swapAfter = config.swapAfter
        this.exposureThreshold = config.exposureThreshold
        this.usedFallbackPoseB = usedFallbackPoseB
        this.wallSize = config.wallSize
        this.maxAbsX = config.maxAbsX
        this.relocateEachStrike = config.relocateEachStrike
        this.slots = config.slots
        this.defaultHome = config.defaultHome
        this.poseBPosition = config.poseBPosition
        this.poseBOffset = config.poseBOffset
        this.baseScale = group.scale.clone()

        this.poseA.name = 'vampire-pose-a'
        this.poseB.name = 'vampire-pose-b'
        // Both meshes sit at group origin; the group moves on the wall.
        this.poseA.position.set(0, 0, 0)
        this.poseB.position.set(0, 0, 0)
        this.poseA.visible = true
        this.poseB.visible = false

        this.strikeHome = this.resolveAndClamp(this.defaultHome)
        this.strikePoseB = this.computePoseBFromHome(this.strikeHome)
        this.applyGroupPosition(this.strikeHome)

        group.visible = false
        setSilhouetteOpacity(group, 0)
    }

    get isUsingFallbackPoseB(): boolean {
        return this.usedFallbackPoseB
    }

    static async create(options: VampirePosesOptions): Promise<VampirePoses> {
        const wallSize = { ...DEFAULT_WALL_SIZE, ...options.wallSize }
        const defaultHome =
            options.position ?? options.offset ?? DEFAULT_OPTIONS.position
        const poseBOffset = {
            ...DEFAULT_OPTIONS.poseBOffset,
            ...options.poseBOffset,
        }
        const slots =
            options.slots !== undefined ? options.slots : [...DEFAULT_OPTIONS.slots]

        const config = {
            poseAUrl: options.poseAUrl ?? DEFAULT_OPTIONS.poseAUrl,
            poseBUrl: options.poseBUrl ?? DEFAULT_OPTIONS.poseBUrl,
            scale: options.scale ?? DEFAULT_OPTIONS.scale,
            height: options.height ?? DEFAULT_OPTIONS.height,
            wallSize,
            defaultHome,
            poseBPosition: options.poseBPosition,
            poseBOffset,
            slots,
            relocateEachStrike:
                options.relocateEachStrike ?? DEFAULT_OPTIONS.relocateEachStrike,
            maxAbsX: options.maxAbsX ?? DEFAULT_OPTIONS.maxAbsX,
            swapAfter: options.swapAfter ?? DEFAULT_OPTIONS.swapAfter,
            exposureThreshold:
                options.exposureThreshold ?? DEFAULT_OPTIONS.exposureThreshold,
        }

        const group = new THREE.Group()
        group.name = 'vampire-poses'
        group.renderOrder = 1

        const poseA = await buildFromPng(config.poseAUrl, config.height)
        let poseB: THREE.Object3D
        let usedFallbackPoseB = false

        try {
            poseB = await buildFromPng(config.poseBUrl, config.height)
        } catch (error) {
            console.warn(
                `[VampirePoses] Could not load pose B ("${config.poseBUrl}"). ` +
                    'Using pose A art; area change still applies.',
                error
            )
            poseB = await buildFromPng(config.poseAUrl, config.height)
            usedFallbackPoseB = true
        }

        group.add(poseA, poseB)
        options.wall.add(group)
        group.scale.multiplyScalar(config.scale)

        return new VampirePoses(group, poseA, poseB, config, usedFallbackPoseB)
    }

    /**
     * Drive reveal + A/B image/area swap from lightning exposure.
     * Pass `delta` each frame so swap timing tracks real time.
     */
    update({
        exposure = 0,
        phase = 0,
        growth = 0,
        maxGrowth = 7.5,
        delta = 0,
    }: SilhouetteUpdateParams): void {
        const lit = exposure > this.exposureThreshold

        if (phase < 1 || !lit) {
            this.flashActive = false
            this.flashAge = 0
            this.activePose = 0
            this.group.visible = false
            setSilhouetteOpacity(this.group, 0)
            this.showPose(0)
            return
        }

        if (!this.flashActive) {
            this.flashActive = true
            this.flashAge = 0
            this.activePose = 0
            this.beginStrike()
            this.showPose(0)
        } else {
            this.flashAge += Math.max(0, delta)
        }

        const nextPose: 0 | 1 = this.flashAge >= this.swapAfter ? 1 : 0
        if (nextPose !== this.activePose) {
            this.activePose = nextPose
            this.showPose(this.activePose)
        }

        const brightness = exposure * exposure
        const scaleProgress = Math.min(growth / (maxGrowth * 0.5), 1)
        const revealScale = 0.8 + scaleProgress * 0.2

        this.group.visible = true
        this.group.scale.copy(this.baseScale).multiplyScalar(revealScale)
        setSilhouetteOpacity(this.group, brightness)
    }

    dispose(): void {
        this.group.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return

            child.geometry.dispose()
            const { material } = child
            if (Array.isArray(material)) {
                for (const entry of material) {
                    entry.map?.dispose()
                    entry.dispose()
                }
            } else {
                material.map?.dispose()
                material.dispose()
            }
        })

        this.group.removeFromParent()
    }

    private beginStrike(): void {
        const homePos =
            this.relocateEachStrike && this.slots.length > 0
                ? this.slots[Math.floor(Math.random() * this.slots.length)]!
                : this.defaultHome

        this.strikeHome = this.resolveAndClamp(homePos)
        this.strikePoseB = this.computePoseBFromHome(this.strikeHome)
        this.applyGroupPosition(this.strikeHome)
    }

    private computePoseBFromHome(home: ResolvedWallPosition): ResolvedWallPosition {
        if (this.poseBPosition) {
            // Absolute B on the wall (still clamped)
            return this.resolveAndClamp(this.poseBPosition)
        }

        return clampWallX(addOffset(home, this.poseBOffset), this.maxAbsX)
    }

    private resolveAndClamp(pos: WallPosition): ResolvedWallPosition {
        return clampWallX(
            resolveWallPosition(pos, this.wallSize),
            this.maxAbsX
        )
    }

    private applyGroupPosition(pos: ResolvedWallPosition): void {
        this.group.position.set(pos.x, pos.y, pos.z)
    }

    private showPose(pose: 0 | 1): void {
        this.poseA.visible = pose === 0
        this.poseB.visible = pose === 1
        this.applyGroupPosition(pose === 0 ? this.strikeHome : this.strikePoseB)
    }
}

/** Factory alias for composition roots. */
export const createVampirePoses = (options: VampirePosesOptions) =>
    VampirePoses.create(options)
