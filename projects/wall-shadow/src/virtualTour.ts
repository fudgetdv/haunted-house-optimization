import type { Camera, Object3D } from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'

export type TourBounds = {
    /** Inclusive min X (world). */
    minX: number
    maxX: number
    /** Inclusive min Z (world). */
    minZ: number
    maxZ: number
}

export type VirtualTourOptions = {
    /** Walking speed in world units per second. Tour-pace default. */
    walkSpeed?: number
    /** Eye height above the floor plane (world Y of floor surface). */
    eyeHeight?: number
    /** World Y of the floor surface the visitor stands on. */
    floorY?: number
    /** Horizontal bounds; visitor is clamped each frame. */
    bounds?: TourBounds
    /**
     * Element that shows "click to enter". Clicking it locks the pointer.
     * Hidden while touring, shown again on unlock (Esc).
     */
    blocker?: HTMLElement | null
    /** Optional element that only receives the enter-tour click (inside blocker). */
    startTarget?: HTMLElement | null
}

export type VirtualTourDependencies = {
    camera: Camera
    /** DOM element used for Pointer Lock (usually document.body or the canvas). */
    domElement: HTMLElement
}

const DEFAULT_OPTIONS = {
    walkSpeed: 2.4,
    eyeHeight: 1.6,
    floorY: -0.6,
    bounds: {
        minX: -9,
        maxX: 9,
        minZ: -3,
        maxZ: 9,
    } satisfies TourBounds,
} as const

type KeyState = {
    forward: boolean
    back: boolean
    left: boolean
    right: boolean
}

/**
 * First-person virtual tour: pointer-lock look + WASD walk, clamped to the room.
 * Composition root creates one instance and calls `update(delta)` each frame.
 */
export class VirtualTour
{
    readonly controls: PointerLockControls

    private readonly walkSpeed: number
    private readonly eyeHeight: number
    private readonly floorY: number
    private readonly bounds: TourBounds
    private readonly blocker: HTMLElement | null
    private readonly startTarget: HTMLElement | null
    private readonly keys: KeyState = {
        forward: false,
        back: false,
        left: false,
        right: false,
    }

    private readonly onKeyDown: (event: KeyboardEvent) => void
    private readonly onKeyUp: (event: KeyboardEvent) => void
    private readonly onLock: () => void
    private readonly onUnlock: () => void
    private readonly onStartClick: (event: Event) => void

    constructor(deps: VirtualTourDependencies, options: VirtualTourOptions = {})
    {
        const config = {
            walkSpeed: options.walkSpeed ?? DEFAULT_OPTIONS.walkSpeed,
            eyeHeight: options.eyeHeight ?? DEFAULT_OPTIONS.eyeHeight,
            floorY: options.floorY ?? DEFAULT_OPTIONS.floorY,
            bounds: { ...DEFAULT_OPTIONS.bounds, ...options.bounds },
        }

        this.walkSpeed = config.walkSpeed
        this.eyeHeight = config.eyeHeight
        this.floorY = config.floorY
        this.bounds = config.bounds
        this.blocker = options.blocker ?? null
        this.startTarget = options.startTarget ?? this.blocker

        this.controls = new PointerLockControls(deps.camera, deps.domElement)

        // Soft look limits — still look up at the wall, not fully upside-down
        this.controls.minPolarAngle = 0.15
        this.controls.maxPolarAngle = Math.PI - 0.2
        this.controls.pointerSpeed = 0.9

        this.placeAtStart(deps.camera)

        this.onKeyDown = (event) => this.setKeyFromEvent(event, true)
        this.onKeyUp = (event) => this.setKeyFromEvent(event, false)
        this.onLock = () => this.setTourActive(true)
        this.onUnlock = () => this.setTourActive(false)
        this.onStartClick = (event) =>
        {
            event.preventDefault()
            this.controls.lock()
        }

        document.addEventListener('keydown', this.onKeyDown)
        document.addEventListener('keyup', this.onKeyUp)
        this.controls.addEventListener('lock', this.onLock)
        this.controls.addEventListener('unlock', this.onUnlock)

        this.startTarget?.addEventListener('click', this.onStartClick)

        // Start unlocked — overlay visible until the visitor opts in
        this.setTourActive(false)
    }

    get isActive(): boolean
    {
        return this.controls.isLocked
    }

    /**
     * Advance walk motion for this frame. Safe to call every tick;
     * does nothing while the pointer is unlocked.
     */
    update(delta: number): void
    {
        if (!this.controls.isLocked)
        {
            return
        }

        const camera = this.controls.object
        const distance = this.walkSpeed * Math.min(delta, 0.1)

        const forward =
            Number(this.keys.forward) - Number(this.keys.back)
        const right =
            Number(this.keys.right) - Number(this.keys.left)

        if (forward !== 0)
        {
            this.controls.moveForward(forward * distance)
        }
        if (right !== 0)
        {
            this.controls.moveRight(right * distance)
        }

        // Keep eyes at standing height and feet on the floor
        camera.position.y = this.floorY + this.eyeHeight

        const { minX, maxX, minZ, maxZ } = this.bounds
        camera.position.x = Math.min(maxX, Math.max(minX, camera.position.x))
        camera.position.z = Math.min(maxZ, Math.max(minZ, camera.position.z))
    }

    /** Reset to the default tour entry pose (still unlocked). */
    resetView(): void
    {
        this.placeAtStart(this.controls.object)
    }

    dispose(): void
    {
        document.removeEventListener('keydown', this.onKeyDown)
        document.removeEventListener('keyup', this.onKeyUp)
        this.controls.removeEventListener('lock', this.onLock)
        this.controls.removeEventListener('unlock', this.onUnlock)

        this.startTarget?.removeEventListener('click', this.onStartClick)

        if (this.controls.isLocked)
        {
            this.controls.unlock()
        }
        this.controls.dispose()
    }

    private placeAtStart(object: Object3D): void
    {
        // Stand back from the wall, facing it (negative Z)
        object.position.set(0, this.floorY + this.eyeHeight, 6)
        object.rotation.set(0, 0, 0)
        object.lookAt(0, this.floorY + this.eyeHeight, -3.5)
    }

    private setTourActive(active: boolean): void
    {
        if (!this.blocker)
        {
            return
        }

        this.blocker.style.display = active ? 'none' : 'flex'
        this.blocker.setAttribute('aria-hidden', active ? 'true' : 'false')

        if (!active)
        {
            this.keys.forward = false
            this.keys.back = false
            this.keys.left = false
            this.keys.right = false
        }
    }

    private setKeyFromEvent(event: KeyboardEvent, pressed: boolean): void
    {
        if (!this.controls.isLocked)
        {
            return
        }

        switch (event.code)
        {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.forward = pressed
                break
            case 'KeyS':
            case 'ArrowDown':
                this.keys.back = pressed
                break
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = pressed
                break
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = pressed
                break
            default:
                return
        }

        // Avoid page scroll / browser shortcuts while touring
        event.preventDefault()
    }
}
