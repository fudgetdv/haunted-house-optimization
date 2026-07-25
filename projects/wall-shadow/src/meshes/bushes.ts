import * as THREE from 'three'
import type { IBushTexture } from '../materials/IBushTexture'
import { createBushTexture } from '../materials/bushTexture'

/** Hand-placed bush (Option A — escape hatch). */
export type BushInstance = {
    /** World position [x, y, z]. */
    position: [number, number, number]
    /** Uniform scale, or [sx, sy, sz]. Default 0.4. */
    scale?: number | [number, number, number]
    /** Pitch that flattens the sphere into a mound. Default -0.75. */
    rotationX?: number
    /** Spin around Y for leaf variety. Default 0. */
    rotationY?: number
}

export type WallAnchor = {
    /** Wall plane width (X). */
    width: number
    /** Wall plane Z (bushes sit slightly in front). */
    z: number
    /** Floor surface Y. */
    floorY: number
    /** Wall center X. Default 0. */
    centerX?: number
}

export type ScaleRange = {
    min: number
    max: number
}

export type JitterRange = {
    x?: number
    z?: number
}

/**
 * End clusters only — left / right of the wall (not spread along the face).
 * `both` = left end + right end.
 */
export type SidesLayout = 'left' | 'right' | 'both' | false

/**
 * Row of bushes along the wall face (X direction).
 * `true` uses defaults; object overrides count / clear gap.
 */
export type AlongLayout =
    | boolean
    | {
          /** How many bushes along the face. Default 6. */
          count?: number
          /**
           * Open gap in the middle (world units). Default 6.
           * Set 0 for a continuous hedge.
           */
          clearCenter?: number
      }

/**
 * Options for bushes at the wall.
 *
 * - **Option B (default):** omit `instances` → generate from `sides` and/or `along`.
 * - **Option A (escape hatch):** pass `instances` → use that list only.
 *
 * Layout modes (can combine):
 * - `sides`: tight clusters at the **left/right ends** only
 * - `along`: a **row along the wall** face
 */
export type BushesOptions = {
    /**
     * Escape hatch: explicit placements.
     * When provided, layout generation is skipped entirely.
     */
    instances?: BushInstance[]

    /** Wall geometry used by the generator. Required when `instances` is omitted. */
    wall?: WallAnchor

    /**
     * End clusters at left / right of the wall.
     * Default `'both'`. Set `false` to disable end clusters.
     * Inferred from `countPerSide` when that uses `{ left, right }`.
     */
    sides?: SidesLayout
    /**
     * Bushes per end cluster.
     * - number → same count on each enabled side (default 3)
     * - `{ left, right }` → independent counts (e.g. `{ left: 3, right: 2 }`)
     */
    countPerSide?: number | { left?: number; right?: number }
    /**
     * How far end bushes may scatter from the corner (world units).
     * Keeps sides as clusters, not a line. Default 0.55.
     */
    sideClusterRadius?: number
    /**
     * Exclusion radius from the wall center on X (world units).
     * Side bushes are forced outside ±this distance so they stay at the ends
     * and never crawl toward the middle. Default: 40% of wall half-width.
     * Example: wall width 20 → half 10 → default min ~4; use 7–8 for tighter ends.
     */
    minDistanceFromCenter?: number

    /**
     * Row along the wall face. Default `false`.
     * Set `true` or `{ count, clearCenter }` to enable.
     */
    along?: AlongLayout

    /** How far in front of the wall (positive = toward +Z / room). Default 0.35. */
    offsetFromWall?: number
    /** Inset from each wall end so bushes don’t hang off. Default 0.5. */
    marginFromEdge?: number
    /** Uniform scale range for generated bushes. Default { min: 0.3, max: 0.55 }. */
    scale?: ScaleRange
    /** Extra random offset after base placement (along row mainly). */
    jitter?: JitterRange
    /** Base pitch (sphere → mound). Default -0.75. */
    rotationX?: number
    /** Seed for reproducible scale / jitter / spin. Default 42. */
    seed?: number

    /** Shared leaf material. Created with defaults if omitted. */
    texture?: IBushTexture
    /** Sphere radius before scale. Default 1. */
    radius?: number
    /** Sphere segments. Default 16. */
    segments?: number
    castShadow?: boolean
    receiveShadow?: boolean
}

export type BushesController = {
    readonly group: THREE.Group
    readonly meshes: readonly THREE.Mesh[]
    readonly texture: IBushTexture
    dispose: () => void
}

const DEFAULT_LAYOUT = {
    sides: 'both' as const,
    countPerSide: 3,
    sideClusterRadius: 0.55,
    /** Fraction of half-width used when minDistanceFromCenter is omitted. */
    minDistanceFromCenterFraction: 0.75,
    along: false as AlongLayout,
    alongCount: 6,
    clearCenter: 6,
    offsetFromWall: 0.35,
    marginFromEdge: 0.5,
    scale: { min: 0.3, max: 0.55 },
    jitter: { x: 0.2, z: 0.12 },
    rotationX: -0.75,
    seed: 42,
    radius: 1,
    segments: 16,
    castShadow: true,
    receiveShadow: false,
}

/**
 * Mulberry32 — small seeded PRNG so layouts are stable across reloads.
 */
function createRng(seed: number): () => number {
    let t = seed >>> 0
    return () => {
        t += 0x6d2b79f5
        let r = Math.imul(t ^ (t >>> 15), 1 | t)
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296
    }
}

function resolveScale(
    scale: number | [number, number, number] | undefined,
    fallback: number
): [number, number, number] {
    if (scale === undefined) return [fallback, fallback, fallback]
    if (typeof scale === 'number') return [scale, scale, scale]
    return scale
}

function resolveAlong(along: AlongLayout | undefined): {
    enabled: boolean
    count: number
    clearCenter: number
} {
    if (along === undefined || along === false) {
        return { enabled: false, count: 0, clearCenter: DEFAULT_LAYOUT.clearCenter }
    }
    if (along === true) {
        return {
            enabled: true,
            count: DEFAULT_LAYOUT.alongCount,
            clearCenter: DEFAULT_LAYOUT.clearCenter,
        }
    }
    return {
        enabled: true,
        count: along.count ?? DEFAULT_LAYOUT.alongCount,
        clearCenter: along.clearCenter ?? DEFAULT_LAYOUT.clearCenter,
    }
}

type GenShared = {
    wall: WallAnchor
    baseZ: number
    centerX: number
    halfW: number
    marginFromEdge: number
    scaleRange: ScaleRange
    rotationX: number
    rng: () => number
}

function makeBush(
    shared: GenShared,
    x: number,
    z: number,
    s: number
): BushInstance {
    const y = shared.wall.floorY + s * 0.4
    return {
        position: [x, y, z],
        scale: s,
        rotationX: shared.rotationX,
        rotationY: shared.rng() * Math.PI * 2,
    }
}

function randomScale(shared: GenShared): number {
    const { min, max } = shared.scaleRange
    return min + shared.rng() * (max - min)
}

function resolveSideCounts(
    countPerSide: number | { left?: number; right?: number } | undefined,
    sides: SidesLayout
): { left: number; right: number } {
    const defaultCount = DEFAULT_LAYOUT.countPerSide

    if (typeof countPerSide === 'object' && countPerSide !== null) {
        return {
            left: countPerSide.left ?? 0,
            right: countPerSide.right ?? 0,
        }
    }

    const n = countPerSide ?? defaultCount
    if (sides === 'left') return { left: n, right: 0 }
    if (sides === 'right') return { left: 0, right: n }
    if (sides === 'both') return { left: n, right: n }
    return { left: 0, right: 0 }
}

/**
 * Push X outward so |x - centerX| >= minDistance (exclusion around wall center).
 */
function clampOutsideCenter(
    x: number,
    centerX: number,
    minDistance: number,
    side: 'left' | 'right'
): number {
    if (minDistance <= 0) return x

    if (side === 'left') {
        const maxX = centerX - minDistance
        return Math.min(x, maxX)
    }

    const minX = centerX + minDistance
    return Math.max(x, minX)
}

/**
 * Option B — sides: tight clusters at the left and/or right **ends** of the wall.
 * Not a line along the face. Enforced by minDistanceFromCenter exclusion zone.
 */
function generateSideClusters(
    shared: GenShared,
    counts: { left: number; right: number },
    clusterRadius: number,
    minDistanceFromCenter: number
): BushInstance[] {
    const { centerX, halfW, marginFromEdge, baseZ, rng } = shared
    const instances: BushInstance[] = []

    const ends: { x: number; count: number; side: 'left' | 'right' }[] = []
    if (counts.left > 0) {
        ends.push({
            x: centerX - halfW + marginFromEdge,
            count: counts.left,
            side: 'left',
        })
    }
    if (counts.right > 0) {
        ends.push({
            x: centerX + halfW - marginFromEdge,
            count: counts.right,
            side: 'right',
        })
    }

    for (const end of ends) {
        for (let i = 0; i < end.count; i++) {
            // Scatter in a small disk around the wall corner only
            const angle = rng() * Math.PI * 2
            const radius = rng() * clusterRadius
            let x = end.x + Math.cos(angle) * radius * 0.85
            const z = baseZ + Math.sin(angle) * radius * 0.5

            // Never allow bushes inside the center exclusion radius
            x = clampOutsideCenter(x, centerX, minDistanceFromCenter, end.side)

            instances.push(makeBush(shared, x, z, randomScale(shared)))
        }
    }

    return instances
}

/**
 * Option B — along: evenly spaced row(s) along the wall face (X).
 * Optional clearCenter leaves a gap in the middle.
 */
function generateAlongWall(
    shared: GenShared,
    count: number,
    clearCenter: number,
    jitter: JitterRange
): BushInstance[] {
    if (count <= 0) return []

    const { centerX, halfW, marginFromEdge, baseZ, rng } = shared
    const xMin = centerX - halfW + marginFromEdge
    const xMax = centerX + halfW - marginFromEdge
    const halfClear = clearCenter / 2

    // Build list of X slots: full span, or two segments if center is cleared
    const slots: number[] = []

    if (clearCenter <= 0) {
        for (let i = 0; i < count; i++) {
            const t = count === 1 ? 0.5 : i / (count - 1)
            slots.push(xMin + (xMax - xMin) * t)
        }
    } else {
        const leftMax = centerX - halfClear
        const rightMin = centerX + halfClear
        const leftCount = Math.floor(count / 2)
        const rightCount = count - leftCount

        const pushBand = (bandMin: number, bandMax: number, n: number) => {
            if (n <= 0 || bandMax <= bandMin) return
            for (let i = 0; i < n; i++) {
                const t = n === 1 ? 0.5 : i / (n - 1)
                slots.push(bandMin + (bandMax - bandMin) * t)
            }
        }

        pushBand(xMin, leftMax, leftCount)
        pushBand(rightMin, xMax, rightCount)
    }

    const jx = jitter.x ?? 0
    const jz = jitter.z ?? 0
    const instances: BushInstance[] = []

    for (const baseX of slots) {
        const x = baseX + (rng() * 2 - 1) * jx
        const z = baseZ + (rng() * 2 - 1) * jz
        instances.push(makeBush(shared, x, z, randomScale(shared)))
    }

    return instances
}

/**
 * Option B: generate side end-clusters and/or an along-wall row.
 */
export function generateBushInstances(options: {
    wall: WallAnchor
    sides?: SidesLayout
    countPerSide?: number | { left?: number; right?: number }
    sideClusterRadius?: number
    minDistanceFromCenter?: number
    along?: AlongLayout
    offsetFromWall?: number
    marginFromEdge?: number
    scale?: ScaleRange
    jitter?: JitterRange
    rotationX?: number
    seed?: number
}): BushInstance[] {
    const wall = options.wall
    // Object form of countPerSide implies both ends unless sides is set explicitly
    const sidesDefault: SidesLayout =
        typeof options.countPerSide === 'object' && options.countPerSide !== null
            ? 'both'
            : DEFAULT_LAYOUT.sides
    const sides = options.sides === undefined ? sidesDefault : options.sides
    const alongCfg = resolveAlong(options.along)
    const sideCounts = resolveSideCounts(options.countPerSide, sides)
    const sideClusterRadius =
        options.sideClusterRadius ?? DEFAULT_LAYOUT.sideClusterRadius
    const halfW = wall.width / 2
    const minDistanceFromCenter =
        options.minDistanceFromCenter ??
        halfW * DEFAULT_LAYOUT.minDistanceFromCenterFraction
    const offsetFromWall = options.offsetFromWall ?? DEFAULT_LAYOUT.offsetFromWall
    const marginFromEdge = options.marginFromEdge ?? DEFAULT_LAYOUT.marginFromEdge
    const scaleRange = { ...DEFAULT_LAYOUT.scale, ...options.scale }
    const jitter = { ...DEFAULT_LAYOUT.jitter, ...options.jitter }
    const rotationX = options.rotationX ?? DEFAULT_LAYOUT.rotationX
    const rng = createRng(options.seed ?? DEFAULT_LAYOUT.seed)

    const shared: GenShared = {
        wall,
        baseZ: wall.z + offsetFromWall,
        centerX: wall.centerX ?? 0,
        halfW,
        marginFromEdge,
        scaleRange,
        rotationX,
        rng,
    }

    const instances: BushInstance[] = []

    if (sideCounts.left > 0 || sideCounts.right > 0) {
        instances.push(
            ...generateSideClusters(
                shared,
                sideCounts,
                sideClusterRadius,
                minDistanceFromCenter
            )
        )
    }

    if (alongCfg.enabled) {
        instances.push(
            ...generateAlongWall(shared, alongCfg.count, alongCfg.clearCenter, jitter)
        )
    }

    if (instances.length === 0) {
        throw new Error(
            'generateBushInstances: enable `sides` and/or `along`, or pass `instances`'
        )
    }

    return instances
}

/**
 * Builds a bush group: shared sphere geometry + shared leaf material.
 * Uses Option B layout by default; pass `instances` for Option A.
 */
export function createBushes(options: BushesOptions = {}): BushesController {
    const texture = options.texture ?? createBushTexture()
    const radius = options.radius ?? DEFAULT_LAYOUT.radius
    const segments = options.segments ?? DEFAULT_LAYOUT.segments
    const castShadow = options.castShadow ?? DEFAULT_LAYOUT.castShadow
    const receiveShadow = options.receiveShadow ?? DEFAULT_LAYOUT.receiveShadow

    let instances: BushInstance[]

    if (options.instances && options.instances.length > 0) {
        // Option A — escape hatch
        instances = options.instances
    } else {
        // Option B — generator
        if (!options.wall) {
            throw new Error(
                'createBushes: provide `wall` for layout generation, or pass `instances` for hand placement'
            )
        }
        instances = generateBushInstances({
            wall: options.wall,
            sides: options.sides,
            countPerSide: options.countPerSide,
            sideClusterRadius: options.sideClusterRadius,
            minDistanceFromCenter: options.minDistanceFromCenter,
            along: options.along,
            offsetFromWall: options.offsetFromWall,
            marginFromEdge: options.marginFromEdge,
            scale: options.scale,
            jitter: options.jitter,
            rotationX: options.rotationX,
            seed: options.seed,
        })
    }

    const geometry = new THREE.SphereGeometry(radius, segments, segments)
    const group = new THREE.Group()
    group.name = 'bushes'

    const meshes: THREE.Mesh[] = []

    for (const inst of instances) {
        const mesh = new THREE.Mesh(geometry, texture.material)
        const [sx, sy, sz] = resolveScale(inst.scale, 0.4)
        mesh.scale.set(sx, sy, sz)
        mesh.position.set(inst.position[0], inst.position[1], inst.position[2])
        mesh.rotation.x = inst.rotationX ?? DEFAULT_LAYOUT.rotationX
        mesh.rotation.y = inst.rotationY ?? 0
        mesh.castShadow = castShadow
        mesh.receiveShadow = receiveShadow
        group.add(mesh)
        meshes.push(mesh)
    }

    return {
        group,
        meshes,
        texture,
        dispose: () => {
            geometry.dispose()
            texture.dispose()
            group.removeFromParent()
        },
    }
}
