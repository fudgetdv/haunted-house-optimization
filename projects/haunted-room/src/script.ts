import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * ============================================================
 * Haunted room
 * ------------------------------------------------------------
 * An old empty room: floor, back wall, two side walls, and a
 * ball resting on the floorboards. The room is "alive":
 *   - dust motes drift slowly through the air
 *   - the camera bobs faintly, like someone standing there
 *   - a shadow crawls up the back wall, ignoring physics
 *   - lightning strikes at random, and for 0.3 seconds at the
 *     peak of each flash, a vampire silhouette is revealed
 * ============================================================
 */

/**
 * Canvas & sizes
 */
const canvas = document.querySelector('canvas.webgl') as HTMLCanvasElement

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
}

/**
 * Room dimensions — everything below derives from these,
 * so resizing the room only means touching these numbers.
 */
const ROOM_WIDTH = 8   // X: side wall to side wall
const ROOM_DEPTH = 8   // Z: camera side to back wall
const ROOM_HEIGHT = 3.5

/**
 * Scene
 */
const scene = new THREE.Scene()
// Background color is driven by the lightning each frame (see below)

/**
 * Helper: soft radial-gradient texture
 * ------------------------------------------------------------
 * Draws a circle that fades from a center color to transparent
 * onto a 2D canvas, and wraps it as a Three.js texture. Used
 * twice: dark version = the crawling shadow, light version =
 * each dust mote. Cheaper and simpler than loading image files.
 */
const makeRadialTexture = (centerColor: string): THREE.CanvasTexture => {
    const size = 128
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')!
    const half = size / 2
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
    gradient.addColorStop(0, centerColor)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)') // fade to fully transparent
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    return new THREE.CanvasTexture(c)
}

/**
 * The room
 * ------------------------------------------------------------
 * Four planes with muted, desaturated colors: dark worn
 * floorboards and aged plaster walls. High roughness makes
 * every surface matte — old rooms don't shine.
 */

// Aged plaster — one shared material for all three walls
const wallMaterial = new THREE.MeshStandardMaterial({
    color: '#7d786b', // faded beige-grey plaster
    roughness: 0.95,
})

// --- Floor ---
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH),
    new THREE.MeshStandardMaterial({
        color: '#4a3c2e', // dark old wood
        roughness: 0.85,
    })
)
floor.rotation.x = -Math.PI * 0.5 // planes start upright; lay it flat
floor.receiveShadow = true
scene.add(floor)

// --- Back wall ---
const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_HEIGHT),
    wallMaterial
)
backWall.position.set(0, ROOM_HEIGHT / 2, -ROOM_DEPTH / 2)
backWall.receiveShadow = true
scene.add(backWall)

// --- Side walls ---
// Planes are single-sided: they render only from the front.
// Rotating each side wall 90° makes its front face INTO the room.
const leftWall = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_DEPTH, ROOM_HEIGHT),
    wallMaterial
)
leftWall.position.set(-ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0)
leftWall.rotation.y = Math.PI * 0.5 // face right, toward room center
leftWall.receiveShadow = true
scene.add(leftWall)

const rightWall = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_DEPTH, ROOM_HEIGHT),
    wallMaterial
)
rightWall.position.set(ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0)
rightWall.rotation.y = -Math.PI * 0.5 // face left, toward room center
rightWall.receiveShadow = true
scene.add(rightWall)

// --- The ball ---
const BALL_RADIUS = 0.4
const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 32, 32),
    new THREE.MeshStandardMaterial({
        color: '#6e2a2a', // worn dark red — a forgotten toy
        roughness: 0.7,
    })
)
// Lift by the radius so it rests ON the floor, slightly off-center
ball.position.set(-1.2, BALL_RADIUS, -0.8)
ball.castShadow = true
scene.add(ball)

/**
 * Dust particles
 * ------------------------------------------------------------
 * THREE.Points renders one tiny sprite per vertex — perfect
 * for particles. We fill a buffer with random positions inside
 * the room, then drift them downward every frame, wrapping
 * back to the ceiling when they reach the floor.
 */
const DUST_COUNT = 300
const DUST_FALL_SPEED = 0.05 // units per second — barely sinking

const dustPositions = new Float32Array(DUST_COUNT * 3) // x, y, z per particle
for (let i = 0; i < DUST_COUNT; i++) {
    dustPositions[i * 3 + 0] = (Math.random() - 0.5) * (ROOM_WIDTH - 0.4)  // x
    dustPositions[i * 3 + 1] = Math.random() * ROOM_HEIGHT                 // y
    dustPositions[i * 3 + 2] = (Math.random() - 0.5) * (ROOM_DEPTH - 0.4)  // z
}

const dustGeometry = new THREE.BufferGeometry()
dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3))

const dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
        map: makeRadialTexture('rgba(255, 250, 235, 0.9)'), // soft pale mote
        size: 0.035,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,      // motes shouldn't hide things behind them
        sizeAttenuation: true,  // farther motes render smaller
    })
)
scene.add(dust)

/**
 * The crawling shadow (back wall)
 * ------------------------------------------------------------
 * A real shadow is locked to physics: light + object positions
 * fully determine it. So to make one move "unnaturally" we FAKE
 * it: a soft dark blob hovering a hair in front of the wall,
 * animated by hand. The lighting never changes while it moves —
 * that impossibility is what reads as creepy.
 */
const wallShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 1.2),
    new THREE.MeshBasicMaterial({
        map: makeRadialTexture('rgba(0, 0, 0, 0.85)'),
        transparent: true,
        depthWrite: false, // avoids z-fighting flicker against the wall
    })
)
// Start low on the wall, where a real object's shadow could sit
const shadowStart = new THREE.Vector3(0.8, 0.6, -ROOM_DEPTH / 2 + 0.01)
wallShadow.position.copy(shadowStart)
scene.add(wallShadow)

/**
 * Lights
 * Dim on purpose — the darker the calm scene, the more violent
 * the lightning feels by contrast.
 */

// Cold, faint fill so the dark corners stay readable
const ambientLight = new THREE.AmbientLight('#b0b8ff', 0.2)
scene.add(ambientLight)

// Moonlight through the missing roof
const directionalLight = new THREE.DirectionalLight('#aab4ff', 1.0)
directionalLight.position.set(3, 6, 4)
directionalLight.castShadow = true

// Keep the shadow camera tight around the room for sharper shadows
directionalLight.shadow.mapSize.set(1024, 1024)
directionalLight.shadow.camera.near = 1
directionalLight.shadow.camera.far = 20
directionalLight.shadow.camera.left = -6
directionalLight.shadow.camera.right = 6
directionalLight.shadow.camera.top = 6
directionalLight.shadow.camera.bottom = -6
scene.add(directionalLight)

/**
 * Vampire silhouette
 * ------------------------------------------------------------
 * Basic 2D shapes standing flat against the back wall, all in
 * flat black MeshBasicMaterial. Basic materials ignore lights,
 * so while the lightning blows the room out to white, the
 * vampire stays pitch black — the reveal works by inversion.
 */
const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: '#000000' })

const vampire = new THREE.Group()

// Cape/body: a trapezoid — wide at the floor, narrow shoulders
const capeShape = new THREE.Shape()
capeShape.moveTo(-0.8, 0)     // bottom-left hem
capeShape.lineTo(0.8, 0)      // bottom-right hem
capeShape.lineTo(0.28, 1.35)  // right shoulder
capeShape.lineTo(-0.28, 1.35) // left shoulder
vampire.add(new THREE.Mesh(new THREE.ShapeGeometry(capeShape), silhouetteMaterial))

// Head: a plain circle above the shoulders
const head = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), silhouetteMaterial)
head.position.y = 1.52
vampire.add(head)

// Pointed ears, Nosferatu-style: two thin triangles.
// ShapeGeometry accepts an array, so both ears fit in one mesh.
const leftEar = new THREE.Shape()
leftEar.moveTo(-0.23, 1.55)
leftEar.lineTo(-0.17, 1.95) // tip
leftEar.lineTo(-0.05, 1.62)
const rightEar = new THREE.Shape()
rightEar.moveTo(0.23, 1.55)
rightEar.lineTo(0.17, 1.95) // tip
rightEar.lineTo(0.05, 1.62)
vampire.add(new THREE.Mesh(new THREE.ShapeGeometry([leftEar, rightEar]), silhouetteMaterial))

// Stand on the floor against the back wall, in front of the
// crawling shadow blob. Hidden until lightning strikes.
vampire.position.set(0, 0, -ROOM_DEPTH / 2 + 0.03)
vampire.visible = false
scene.add(vampire)

/**
 * Lightning setup
 * ------------------------------------------------------------
 * A flash is just the existing lights driven WAY past normal
 * intensity for a fraction of a second while the sky color
 * jumps toward white. No extra light objects needed.
 */
const FLASH_EVERY_MIN = 4   // seconds — shortest gap between strikes
const FLASH_EVERY_MAX = 9   // seconds — longest gap
const FLASH_DURATION = 0.7  // seconds — how long one strike lasts
const VAMPIRE_REVEAL = 0.3  // seconds — vampire visible at flash start

// Remember the calm-scene values so each flash decays back to them
const BASE_DIR_INTENSITY = directionalLight.intensity
const BASE_AMBIENT_INTENSITY = ambientLight.intensity

// `sky` is the live color on scene.background; every frame it gets
// blended between the two endpoints by the current flash strength
const SKY_DARK = new THREE.Color('#0b0b14')  // near-black stormy night
const SKY_FLASH = new THREE.Color('#dfe6ff') // blinding blue-white
const sky = SKY_DARK.clone()
scene.background = sky

// Mutable strike state
let flashStartedAt = -Infinity // elapsed time of the last strike
let nextFlashAt = 2.5          // first strike ~2.5s in

/**
 * Camera + bob rig
 * ------------------------------------------------------------
 * The camera sits inside a Group ("the body"). OrbitControls
 * moves the camera itself; we bob the GROUP. The two never
 * fight over the same object, so orbiting keeps working while
 * the whole view sways gently — like standing, breathing.
 */
const camera = new THREE.PerspectiveCamera(
    60,                          // field of view in degrees
    sizes.width / sizes.height,  // aspect ratio
    0.1,                         // near clipping plane
    100                          // far clipping plane
)
camera.position.set(0, 1.6, 3.2) // eye height, inside the room

const cameraRig = new THREE.Group()
cameraRig.add(camera)
scene.add(cameraRig)

/**
 * Controls
 */
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true       // smooth, inertia-like movement
controls.target.set(0, 1.1, -1.5)   // look into the room, toward the back wall
controls.maxDistance = 5            // don't zoom out through the walls

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

/**
 * Handle window resizing
 */
window.addEventListener('resize', () => {
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Animation loop
 * All motion is driven by TIME (elapsed / delta), never by
 * "per frame" increments — so the speed is identical on 60Hz
 * and 144Hz monitors.
 */
const clock = new THREE.Clock()

// Crawling-shadow tuning knobs
const CRAWL_SPEED = 0.05  // units per second — glacially slow
const SWAY_AMOUNT = 0.15  // side-to-side drift distance
const SWAY_SPEED = 0.3    // drift oscillation speed

const tick = () => {
    const delta = clock.getDelta()        // seconds since last frame
    const elapsed = clock.elapsedTime     // seconds since start

    // --- Camera bob ---
    // Two sine waves at unrelated frequencies sum into a sway that
    // never quite repeats — reads as "someone standing" rather than
    // a metronome. Amplitudes are tiny; subtlety is everything.
    cameraRig.position.y =
        Math.sin(elapsed * 1.4) * 0.02 + Math.sin(elapsed * 2.3) * 0.008
    cameraRig.position.x = Math.sin(elapsed * 0.9) * 0.01

    // --- Dust drift ---
    // Nudge every particle down a little; wrap floor → ceiling.
    // Mutating the buffer requires flagging it for re-upload to
    // the GPU (needsUpdate), or nothing moves on screen.
    const positions = dustGeometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < DUST_COUNT; i++) {
        let y = positions.getY(i) - DUST_FALL_SPEED * delta
        if (y < 0) y = ROOM_HEIGHT // reached the floor — respawn at ceiling
        positions.setY(i, y)

        // faint sideways wander; the (+ i) offsets desynchronize particles
        positions.setX(i, positions.getX(i) + Math.sin(elapsed * 0.4 + i) * 0.0004)
    }
    positions.needsUpdate = true

    // --- Creepy shadow crawl ---
    // Rise painfully slowly, loop back down once past the wall top
    const climb = (elapsed * CRAWL_SPEED) % (ROOM_HEIGHT - shadowStart.y + 0.8)
    wallShadow.position.y = shadowStart.y + climb

    // Drift slightly side to side, like something searching
    wallShadow.position.x =
        shadowStart.x + Math.sin(elapsed * SWAY_SPEED) * SWAY_AMOUNT

    // Stretch taller and thinner as it rises — elongating shadows
    // feel distinctly wrong
    const stretch = 1 + climb * 0.25
    wallShadow.scale.set(1 / stretch, stretch, 1)

    // Slow "breathing" of the darkness itself
    wallShadow.material.opacity = 0.75 + Math.sin(elapsed * 0.8) * 0.25

    // --- Lightning ---
    // Time for a new strike? Start it and schedule the next one at
    // a random interval (a predictable rhythm isn't scary).
    if (elapsed >= nextFlashAt) {
        flashStartedAt = elapsed
        nextFlashAt = elapsed +
            FLASH_EVERY_MIN + Math.random() * (FLASH_EVERY_MAX - FLASH_EVERY_MIN)

        // The vampire waits somewhere new along the wall each strike
        vampire.position.x = (Math.random() - 0.5) * (ROOM_WIDTH - 2)
    }

    // Flash brightness envelope: two decaying spikes, like a strike
    // followed by its immediate re-strike. Math.exp(-t * 10) drops
    // from 1 to near 0 in a few tenths of a second — nice and sharp.
    const flashAge = elapsed - flashStartedAt
    let flash = 0
    if (flashAge < FLASH_DURATION) {
        const spike = (t: number) => (t < 0 ? 0 : Math.exp(-t * 10))
        flash = Math.min(1, spike(flashAge) + 0.6 * spike(flashAge - 0.25))
    }

    // Over-expose: drive the lights far past their normal values so
    // surfaces clip toward white, and slam the sky to the flash color
    directionalLight.intensity = BASE_DIR_INTENSITY + flash * 12
    ambientLight.intensity = BASE_AMBIENT_INTENSITY + flash * 4
    sky.lerpColors(SKY_DARK, SKY_FLASH, flash)

    // The vampire exists only in the first 0.3s of a strike —
    // by the time your eyes adjust, it's gone
    vampire.visible = flashAge < VAMPIRE_REVEAL

    // Required each frame when enableDamping is true
    controls.update()

    renderer.render(scene, camera)
    window.requestAnimationFrame(tick)
}

tick()
