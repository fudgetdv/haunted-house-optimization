import { MathUtils, Vector3, type Camera } from 'three'

export type LookControlsOptions = {
    /** Radians per pixel of drag. Default 0.004. */
    sensitivity?: number
    /** Max pitch up/down from horizon (radians). Default ~85°. */
    maxPitch?: number
    /**
     * Movement (px) below this on pointer-up counts as a click, not a drag.
     * Default 6.
     */
    clickThresholdPx?: number
    /** Called on a short click (not a drag). NDC coords in -1…1. */
    onClick?: (ndcX: number, ndcY: number) => void
}

/**
 * Click-and-hold drag to look around. Camera stays fixed; only yaw/pitch change.
 * Short clicks (little movement) fire `onClick` for hotspot picking.
 */
export class LookControls
{
    private readonly camera: Camera
    private readonly domElement: HTMLElement
    private readonly sensitivity: number
    private readonly maxPitch: number
    private readonly clickThresholdPx: number
    private readonly onClick?: (ndcX: number, ndcY: number) => void

    private yaw = 0
    private pitch = 0
    private pointerId: number | null = null
    private lastX = 0
    private lastY = 0
    private dragging = false
    private movedPx = 0

    private readonly onPointerDown: (event: PointerEvent) => void
    private readonly onPointerMove: (event: PointerEvent) => void
    private readonly onPointerUp: (event: PointerEvent) => void
    private readonly onContextMenu: (event: Event) => void

    constructor(
        camera: Camera,
        domElement: HTMLElement,
        options: LookControlsOptions = {},
    )
    {
        this.camera = camera
        this.domElement = domElement
        this.sensitivity = options.sensitivity ?? 0.004
        this.maxPitch = options.maxPitch ?? (Math.PI / 2 - 0.05)
        this.clickThresholdPx = options.clickThresholdPx ?? 6
        this.onClick = options.onClick

        this.camera.rotation.order = 'YXZ'

        this.onPointerDown = (event) => this.handlePointerDown(event)
        this.onPointerMove = (event) => this.handlePointerMove(event)
        this.onPointerUp = (event) => this.handlePointerUp(event)
        this.onContextMenu = (event) => event.preventDefault()

        this.domElement.style.touchAction = 'none'
        this.domElement.addEventListener('pointerdown', this.onPointerDown)
        this.domElement.addEventListener('pointermove', this.onPointerMove)
        this.domElement.addEventListener('pointerup', this.onPointerUp)
        this.domElement.addEventListener('pointercancel', this.onPointerUp)
        this.domElement.addEventListener('contextmenu', this.onContextMenu)

        this.applyRotation()
    }

    getYaw(): number
    {
        return this.yaw
    }

    getPitch(): number
    {
        return this.pitch
    }

    /** Reset look to yaw/pitch (default forward −Z). */
    reset(yaw = 0, pitch = 0): void
    {
        this.yaw = yaw
        this.pitch = pitch
        this.applyRotation()
    }

    /**
     * Point the camera along a world direction (for seamless stop transitions).
     * Uses the same convention as hotspots: (0,0,-1) is default forward.
     */
    lookToward(direction: { x: number; y: number; z: number }): void
    {
        const dir = new Vector3(direction.x, direction.y, direction.z)
        if (dir.lengthSq() < 1e-8)
        {
            this.reset(0, 0)
            return
        }
        dir.normalize()

        // Match Three YXZ: yaw=0,pitch=0 looks down −Z
        this.yaw = Math.atan2(-dir.x, -dir.z)
        this.pitch = Math.asin(MathUtils.clamp(dir.y, -1, 1))
        this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.pitch))
        this.applyRotation()
    }

    dispose(): void
    {
        this.domElement.removeEventListener('pointerdown', this.onPointerDown)
        this.domElement.removeEventListener('pointermove', this.onPointerMove)
        this.domElement.removeEventListener('pointerup', this.onPointerUp)
        this.domElement.removeEventListener('pointercancel', this.onPointerUp)
        this.domElement.removeEventListener('contextmenu', this.onContextMenu)
    }

    private handlePointerDown(event: PointerEvent): void
    {
        if (event.button !== 0)
        {
            return
        }

        this.pointerId = event.pointerId
        this.dragging = true
        this.movedPx = 0
        this.lastX = event.clientX
        this.lastY = event.clientY
        this.domElement.setPointerCapture(event.pointerId)
        this.domElement.style.cursor = 'grabbing'
    }

    private handlePointerMove(event: PointerEvent): void
    {
        if (!this.dragging || event.pointerId !== this.pointerId)
        {
            return
        }

        const dx = event.clientX - this.lastX
        const dy = event.clientY - this.lastY
        this.lastX = event.clientX
        this.lastY = event.clientY

        this.movedPx += Math.hypot(dx, dy)

        this.yaw -= dx * this.sensitivity
        this.pitch -= dy * this.sensitivity
        this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.pitch))
        this.applyRotation()
    }

    private handlePointerUp(event: PointerEvent): void
    {
        if (event.pointerId !== this.pointerId)
        {
            return
        }

        const wasDragging = this.dragging
        const moved = this.movedPx
        const x = event.clientX
        const y = event.clientY

        this.dragging = false
        this.pointerId = null
        this.domElement.style.cursor = 'grab'

        try
        {
            this.domElement.releasePointerCapture(event.pointerId)
        }
        catch
        {
            // already released
        }

        if (wasDragging && moved < this.clickThresholdPx && this.onClick)
        {
            const rect = this.domElement.getBoundingClientRect()
            const ndcX = ((x - rect.left) / rect.width) * 2 - 1
            const ndcY = -((y - rect.top) / rect.height) * 2 + 1
            this.onClick(ndcX, ndcY)
        }
    }

    private applyRotation(): void
    {
        this.camera.rotation.y = this.yaw
        this.camera.rotation.x = this.pitch
        this.camera.rotation.z = 0
    }
}
