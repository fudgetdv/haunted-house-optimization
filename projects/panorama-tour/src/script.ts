import * as THREE from 'three'
import type { IVirtual } from './virtual'
import { createVirtualOutside } from './virtual'
import { LookControls } from './lookControls'
import { HotspotController, type HotspotNavigateInfo } from './hotspots'
import { TOUR_STOPS, stopIndexById } from './tourStops'

/**
 * ============================================================
 * Panorama Tour — look + hotspots with continuous flow
 * ------------------------------------------------------------
 * • Drag to look
 * • Click hotspot → short fade, keep facing the travel direction
 * • Optional stop bar / keys 1…N (N = TOUR_STOPS.length)
 * ============================================================
 */

const canvas = document.querySelector('canvas.webgl')

if (!(canvas instanceof HTMLCanvasElement))
{
    throw new Error('Canvas element not found')
}

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
}

const PANORAMA_SIZE = 40
const EYE_HEIGHT = 1.6
/** Crossfade length when changing panoramas (ms). */
const TRANSITION_MS = 400

// --- Scene ---
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0b0b12)

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
scene.add(ambientLight)

// --- Camera (fixed position; only rotation changes) ---
const camera = new THREE.PerspectiveCamera(
    75,
    sizes.width / sizes.height,
    0.1,
    PANORAMA_SIZE * 2,
)
camera.position.set(0, EYE_HEIGHT, 0)
scene.add(camera)

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
canvas.style.cursor = 'grab'

// --- UI ---
const stopBar = document.querySelector('#stop-bar')
const hint = document.querySelector('#tour-hint')
const veil = document.querySelector('#transition-veil')

const environments: IVirtual[] = []
let look: LookControls | null = null
let hotspots: HotspotController | null = null
let activeStopIndex = 0
let transitioning = false

const sleep = (ms: number) =>
    new Promise<void>((resolve) =>
    {
        window.setTimeout(resolve, ms)
    })

const setVeil = async (on: boolean) =>
{
    if (!(veil instanceof HTMLElement))
    {
        return
    }
    veil.classList.toggle('is-on', on)
    // Match CSS transition duration
    await sleep(TRANSITION_MS)
}

type GoToStopOptions = {
    /** Face this way after the cut (hotspot flow). */
    arrivalDirection?: THREE.Vector3
    /** If true, snap look to default forward. Default false (keep or use arrival). */
    resetView?: boolean
    /** Crossfade. Default true for user navigation. */
    fade?: boolean
}

const applyStopVisibility = (index: number) =>
{
    for (let i = 0; i < environments.length; i++)
    {
        environments[i]!.mesh.visible = i === index
    }

    hotspots?.setActiveStop(index)

    if (stopBar instanceof HTMLElement)
    {
        const buttons = stopBar.querySelectorAll<HTMLButtonElement>('[data-stop]')
        buttons.forEach((btn) =>
        {
            const i = Number(btn.dataset.stop)
            btn.classList.toggle('is-active', i === index)
            btn.setAttribute('aria-pressed', i === index ? 'true' : 'false')
        })
    }

    camera.position.set(0, EYE_HEIGHT, 0)
}

/**
 * Switch panorama with optional fade + continuous look direction.
 * This is what makes the tour “flow” instead of hard-cutting to default forward.
 */
const goToStop = async (index: number, options: GoToStopOptions = {}) =>
{
    if (index < 0 || index >= environments.length || index === activeStopIndex)
    {
        return
    }
    if (transitioning)
    {
        return
    }

    transitioning = true
    const fade = options.fade !== false

    try
    {
        if (fade)
        {
            await setVeil(true)
        }

        activeStopIndex = index
        applyStopVisibility(index)

        if (options.arrivalDirection)
        {
            // Keep facing the way you clicked (or custom arrivalDirection)
            look?.lookToward(options.arrivalDirection)
        }
        else if (options.resetView)
        {
            look?.reset(0, 0)
        }
        // else: preserve current yaw/pitch (stop bar / keys)

        if (fade)
        {
            // One frame with new pano under the veil, then fade in
            await sleep(32)
            await setVeil(false)
        }
    }
    finally
    {
        transitioning = false
    }
}

const onHotspotNavigate = (info: HotspotNavigateInfo) =>
{
    void goToStop(info.targetStopIndex, {
        arrivalDirection: info.arrivalDirection,
        fade: true,
    })
}

const buildStopBar = () =>
{
    if (!(stopBar instanceof HTMLElement))
    {
        return
    }

    stopBar.replaceChildren()

    TOUR_STOPS.forEach((stop, index) =>
    {
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.stop = String(index)
        button.textContent = stop.label
        button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false')
        if (index === 0)
        {
            button.classList.add('is-active')
        }

        button.addEventListener('click', (event) =>
        {
            event.stopPropagation()
            void goToStop(index, { fade: true })
        })

        stopBar.appendChild(button)
    })
}

// Keys 1…N jump to stop index (N = TOUR_STOPS.length, max 9)
window.addEventListener('keydown', (event) =>
{
    const digit = event.code.match(/^Digit([1-9])$/)
        ?? event.code.match(/^Numpad([1-9])$/)
    if (!digit)
    {
        return
    }
    const index = Number(digit[1]) - 1
    if (index < TOUR_STOPS.length)
    {
        void goToStop(index, { fade: true })
    }
})

// --- Load panoramas + wire look / hotspots ---
Promise.all(
    TOUR_STOPS.map((stop) =>
        createVirtualOutside({
            textureUrl: stop.textureUrl,
            size: PANORAMA_SIZE,
            eyeHeight: EYE_HEIGHT,
        })
    ),
)
    .then((loaded) =>
    {
        for (const env of loaded)
        {
            env.mesh.visible = false
            scene.add(env.mesh)
            environments.push(env)
        }

        hotspots = new HotspotController({
            camera,
            scene,
            eyeHeight: EYE_HEIGHT,
            resolveStopIndex: stopIndexById,
            onNavigate: onHotspotNavigate,
            // Match flipped inside-view pano: L/R and N/S both mirrored
            mirrorX: true,
            mirrorZ: true,
        })
        hotspots.setStops(TOUR_STOPS.map((stop) => stop.hotspots))

        look = new LookControls(camera, canvas, {
            onClick: (ndcX, ndcY) =>
            {
                if (transitioning)
                {
                    return
                }
                hotspots?.tryClick(ndcX, ndcY)
            },
        })

        buildStopBar()
        activeStopIndex = 0
        applyStopVisibility(0)
        look.reset(0, 0)

        if (hint instanceof HTMLElement)
        {
            const n = TOUR_STOPS.length
            hint.textContent =
                n <= 1
                    ? 'Drag to look · Click a glowing spot to move'
                    : `Drag to look · Click a glowing spot to move · 1–${n} for stops`
            hint.hidden = false
        }
    })
    .catch((error: unknown) =>
    {
        console.error('Failed to load tour panoramas:', error)
    })

// --- Resize ---
window.addEventListener('resize', () =>
{
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

// --- Loop ---
const clock = new THREE.Clock()

const tick = () =>
{
    const delta = clock.getDelta()
    hotspots?.update(delta)
    renderer.render(scene, camera)
    window.requestAnimationFrame(tick)
}

tick()
