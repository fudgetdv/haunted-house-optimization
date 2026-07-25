import * as THREE from 'three'

export type HotspotDef = {
    /** Tour stop id to jump to when clicked. */
    targetStopId: string
    /**
     * Direction from the camera (world). Will be normalized.
     * Y is relative to eye height (0 = horizon).
     */
    direction: [number, number, number]
    /** Distance from camera along direction. Default 6. */
    distance?: number
    /**
     * Which way to face after arriving at the target stop.
     * Defaults to the same as `direction` (you keep looking the way you clicked).
     * Set this if the next panorama’s “forward” compass doesn’t match.
     */
    arrivalDirection?: [number, number, number]
    /** Optional label for debugging / future UI. */
    label?: string
}

export type HotspotNavigateInfo = {
    targetStopIndex: number
    /** World direction of the hotspot (used for continuous look). */
    lookDirection: THREE.Vector3
    /** Preferred facing after the cut (may equal lookDirection). */
    arrivalDirection: THREE.Vector3
}

export type HotspotControllerOptions = {
    camera: THREE.Camera
    scene: THREE.Scene
    /** World Y of the camera / eye. Hotspots sit at this height + direction.y. */
    eyeHeight: number
    /** Resolve stop id → index in TOUR_STOPS. */
    resolveStopIndex: (stopId: string) => number
    /** Called when a hotspot is activated. */
    onNavigate: (info: HotspotNavigateInfo) => void
    /**
     * Match panorama texture flip (defaults true).
     * Author directions in capture/compass space in tourStops:
     *   east +X, west −X, north −Z, south +Z
     * These flags map that into the mirrored inside-view texture.
     */
    mirrorX?: boolean
    /** Fix north/south if they appear swapped (e.g. “south” points like r0). Default true. */
    mirrorZ?: boolean
}

/**
 * Floating click targets in the panorama. Only the active stop’s hotspots show.
 */
export class HotspotController
{
    private readonly camera: THREE.Camera
    private readonly eyeHeight: number
    private readonly resolveStopIndex: (stopId: string) => number
    private readonly onNavigate: (info: HotspotNavigateInfo) => void
    /** Match pano L/R flip (default true). */
    private readonly mirrorX: boolean
    /** Match pano N/S if inverted (default true). */
    private readonly mirrorZ: boolean
    private readonly raycaster = new THREE.Raycaster()
    private readonly pointer = new THREE.Vector2()
    private readonly root = new THREE.Group()
    private readonly stopGroups: THREE.Group[] = []
    private activeStopIndex = 0
    private elapsed = 0

    constructor(options: HotspotControllerOptions)
    {
        this.camera = options.camera
        this.eyeHeight = options.eyeHeight
        this.resolveStopIndex = options.resolveStopIndex
        this.onNavigate = options.onNavigate
        this.mirrorX = options.mirrorX !== false
        this.mirrorZ = options.mirrorZ !== false

        this.root.name = 'hotspots'
        options.scene.add(this.root)
    }

    setStops(hotspotsByStop: HotspotDef[][]): void
    {
        for (const group of this.stopGroups)
        {
            this.root.remove(group)
            group.traverse((obj) =>
            {
                if (obj instanceof THREE.Mesh)
                {
                    obj.geometry.dispose()
                    const mat = obj.material
                    if (Array.isArray(mat))
                    {
                        mat.forEach((m) => m.dispose())
                    }
                    else
                    {
                        mat.dispose()
                    }
                }
            })
        }
        this.stopGroups.length = 0

        hotspotsByStop.forEach((defs, stopIndex) =>
        {
            const group = new THREE.Group()
            group.name = `hotspots-stop-${stopIndex}`
            group.visible = stopIndex === this.activeStopIndex

            for (const def of defs)
            {
                group.add(this.createHotspotMesh(def))
            }

            this.stopGroups.push(group)
            this.root.add(group)
        })
    }

    setActiveStop(index: number): void
    {
        this.activeStopIndex = index
        this.stopGroups.forEach((group, i) =>
        {
            group.visible = i === index
        })
    }

    /**
     * Raycast from NDC click. Returns true if a hotspot was hit.
     */
    tryClick(ndcX: number, ndcY: number): boolean
    {
        this.pointer.set(ndcX, ndcY)
        this.raycaster.setFromCamera(this.pointer, this.camera)

        const activeGroup = this.stopGroups[this.activeStopIndex]
        if (!activeGroup)
        {
            return false
        }

        // recursive: ring children can be hit
        const hits = this.raycaster.intersectObjects(activeGroup.children, true)
        const hit = hits[0]
        if (!hit)
        {
            return false
        }

        let obj: THREE.Object3D | null = hit.object
        let targetId: string | undefined
        let lookDir: THREE.Vector3 | undefined
        let arrivalDir: THREE.Vector3 | undefined

        while (obj)
        {
            if (typeof obj.userData.targetStopId === 'string')
            {
                targetId = obj.userData.targetStopId
                lookDir = obj.userData.lookDirection as THREE.Vector3 | undefined
                arrivalDir = obj.userData.arrivalDirection as THREE.Vector3 | undefined
                break
            }
            obj = obj.parent
        }

        if (!targetId)
        {
            return false
        }

        const targetIndex = this.resolveStopIndex(targetId)
        if (targetIndex < 0)
        {
            return false
        }

        const look = (lookDir ?? new THREE.Vector3(0, 0, -1)).clone().normalize()
        const arrival = (arrivalDir ?? look).clone().normalize()

        this.onNavigate({
            targetStopIndex: targetIndex,
            lookDirection: look,
            arrivalDirection: arrival,
        })
        return true
    }

    update(delta: number): void
    {
        this.elapsed += delta
        const scale = 1 + Math.sin(this.elapsed * 3) * 0.08

        const activeGroup = this.stopGroups[this.activeStopIndex]
        if (!activeGroup)
        {
            return
        }

        for (const child of activeGroup.children)
        {
            child.scale.setScalar(scale)
        }
    }

    dispose(): void
    {
        this.setStops([])
        this.root.removeFromParent()
    }

    private createHotspotMesh(def: HotspotDef): THREE.Mesh
    {
        const distance = def.distance ?? 6
        const dir = this.toWorldDirection(def.direction)
        const arrival = def.arrivalDirection
            ? this.toWorldDirection(def.arrivalDirection)
            : dir.clone()

        const geometry = new THREE.SphereGeometry(0.28, 24, 16)
        const material = new THREE.MeshBasicMaterial({
            color: 0xdce6ff,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
        })

        const mesh = new THREE.Mesh(geometry, material)
        mesh.position
            .copy(dir)
            .multiplyScalar(distance)
            .add(new THREE.Vector3(0, this.eyeHeight, 0))

        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.34, 0.42, 32),
            new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.55,
                side: THREE.DoubleSide,
                depthWrite: false,
            }),
        )
        ring.lookAt(0, this.eyeHeight, 0)
        mesh.add(ring)

        mesh.userData.targetStopId = def.targetStopId
        mesh.userData.lookDirection = dir.clone()
        mesh.userData.arrivalDirection = arrival
        mesh.userData.label = def.label ?? def.targetStopId
        mesh.name = `hotspot-${def.targetStopId}`

        return mesh
    }

    /**
     * Author directions in tourStops as capture/compass space
     * (east = +X, north = −Z). Mirror to match the flipped inside-view pano.
     */
    private toWorldDirection(raw: [number, number, number]): THREE.Vector3
    {
        const dir = new THREE.Vector3(raw[0], raw[1], raw[2])
        if (dir.lengthSq() < 1e-6)
        {
            dir.set(0, 0, -1)
        }
        if (this.mirrorX)
        {
            dir.x *= -1
        }
        if (this.mirrorZ)
        {
            dir.z *= -1
        }
        return dir.normalize()
    }
}
