import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * ============================================================
 * Three.js starter scene
 * ------------------------------------------------------------
 * A sphere (ball) resting on a plane (floor), with a wall
 * behind it. A directional light casts shadows, and
 * OrbitControls lets you drag to look around.
 *
 * The four essentials of every Three.js app:
 *   1. Scene    — the container that holds all objects/lights
 *   2. Camera   — the point of view the scene is rendered from
 *   3. Renderer — draws the scene onto a <canvas> element
 *   4. Loop     — re-renders every frame (~60x per second)
 * ============================================================
 */

/**
 * Canvas & sizes
 */
// The <canvas> element in index.html that we render into
const canvas = document.querySelector('canvas.webgl') as HTMLCanvasElement

// Track viewport size so the render fills the window
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
}

/**
 * Scene
 */
const scene = new THREE.Scene()
// Background color is assigned in the "Lightning" section below —
// it has to blend between a dark sky and the flash color every frame

/**
 * Objects
 * Every visible object is a Mesh = Geometry (shape) + Material (surface).
 * MeshStandardMaterial reacts to light — it needs at least one light
 * in the scene or it will render black.
 */

// --- The ball ---
const ball = new THREE.Mesh(
    // radius 0.5, then horizontal/vertical segments (more = smoother sphere)
    new THREE.SphereGeometry(0.5, 32, 32),
    new THREE.MeshStandardMaterial({
        color: '#e94560',
        roughness: 0.4, // 0 = shiny mirror-like, 1 = fully matte
    })
)
// Lift the ball by its radius so it sits ON the floor instead of halfway in it
ball.position.y = 0.5
ball.castShadow = true // this object blocks light → casts a shadow

scene.add(ball)

// --- The floor ---
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10), // width, height
    new THREE.MeshStandardMaterial({
        color: '#8d99ae',
        roughness: 0.8,
    })
)
// Planes are created standing upright (facing the camera).
// Rotate -90° around X to lay it flat like a floor.
floor.rotation.x = -Math.PI * 0.5
floor.receiveShadow = true // shadows from other objects land on this surface

scene.add(floor)

// --- The wall ---
const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 4),
    new THREE.MeshStandardMaterial({
        color: '#c9d6df',
        roughness: 0.9,
    })
)
// Push the wall to the back edge of the floor and raise it
// so its bottom edge meets the ground (height 4 → up by 2).
wall.position.z = -5
wall.position.y = 2
wall.receiveShadow = true

scene.add(wall)

/**
 * The creepy wall shadow
 * ------------------------------------------------------------
 * A real shadow is locked to physics: light position + ball
 * position fully determine where it lands. To make a shadow
 * move "unnaturally" (while the ball and light stay still),
 * we FAKE it: a soft dark blob drawn just in front of the wall
 * that we animate by hand. Because the real lighting never
 * changes, the moving shadow reads as impossible — creepy.
 */

// Draw a soft radial gradient (black center → transparent edge)
// onto a 2D canvas, then use it as a texture. This gives the
// blob fuzzy edges like a real soft shadow.
const shadowCanvas = document.createElement('canvas')
shadowCanvas.width = 128
shadowCanvas.height = 128
const ctx = shadowCanvas.getContext('2d')!
const gradient = ctx.createRadialGradient(
    64, 64, 0,  // inner circle: center of the canvas
    64, 64, 64  // outer circle: edge of the canvas
)
gradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)') // dark core
gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')    // fades to nothing
ctx.fillStyle = gradient
ctx.fillRect(0, 0, 128, 128)

const shadowTexture = new THREE.CanvasTexture(shadowCanvas)

// The blob itself: a small plane hovering a hair in front of
// the wall. MeshBasicMaterial ignores lights, so it stays a
// flat dark stain no matter what the lighting does.
const wallShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1.4),
    new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,  // respect the gradient's alpha
        depthWrite: false,  // avoids z-fighting artifacts with the wall
    })
)

// Where the ball's shadow WOULD plausibly be: low on the wall,
// lined up with the ball. It starts believable... then moves.
const shadowStart = new THREE.Vector3(0, 0.5, -4.99) // 0.01 in front of wall
wallShadow.position.copy(shadowStart)
scene.add(wallShadow)

/**
 * Lights
 */

// Ambient light: soft, directionless fill so shadows aren't pitch black.
// Kept dim on purpose — the darker the base scene, the more violent
// the lightning flash feels by contrast.
const ambientLight = new THREE.AmbientLight('#b0b8ff', 0.25)
scene.add(ambientLight)

// Directional light: parallel rays, like the moon here.
// It shines from its position toward the scene origin (0, 0, 0).
const directionalLight = new THREE.DirectionalLight('#aab4ff', 1.2)
directionalLight.position.set(4, 5, 3)
directionalLight.castShadow = true

// Shadow quality settings.
// The shadow "camera" is the region the light computes shadows for —
// keep it as tight as possible around your scene for sharper shadows.
directionalLight.shadow.mapSize.set(1024, 1024) // shadow texture resolution
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
 * Built from basic 2D shapes standing flat against the wall.
 * Every part shares one flat black MeshBasicMaterial — it
 * ignores lighting entirely, so while the lightning blows out
 * the rest of the scene to white, the vampire stays pitch
 * black. That inversion is what makes the reveal land.
 */
const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: '#000000' })

const vampire = new THREE.Group()

// Cape/body: a trapezoid — wide at the floor, narrow shoulders
const capeShape = new THREE.Shape()
capeShape.moveTo(-0.8, 0)     // bottom-left hem
capeShape.lineTo(0.8, 0)      // bottom-right hem
capeShape.lineTo(0.28, 1.35)  // right shoulder
capeShape.lineTo(-0.28, 1.35) // left shoulder
const cape = new THREE.Mesh(new THREE.ShapeGeometry(capeShape), silhouetteMaterial)
vampire.add(cape)

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
const ears = new THREE.Mesh(new THREE.ShapeGeometry([leftEar, rightEar]), silhouetteMaterial)
vampire.add(ears)

// Stand it on the floor, just in front of the wall (and in front
// of the crawling shadow blob at z = -4.99). Hidden until a strike.
vampire.position.set(0, 0, -4.97)
vampire.visible = false
scene.add(vampire)

/**
 * Lightning setup
 * ------------------------------------------------------------
 * A flash is just the existing lights driven WAY past their
 * normal intensity for a fraction of a second, while the sky
 * color jumps toward white. No new light objects needed.
 */
const FLASH_EVERY_MIN = 4   // seconds — shortest gap between strikes
const FLASH_EVERY_MAX = 8   // seconds — longest gap
const FLASH_DURATION = 0.7  // seconds — how long one strike lasts
const VAMPIRE_REVEAL = 0.3  // seconds — vampire visible at flash start

// Remember the calm-scene values so the flash can decay back to them
const BASE_DIR_INTENSITY = directionalLight.intensity
const BASE_AMBIENT_INTENSITY = ambientLight.intensity

// Sky colors: `sky` is the live object on scene.background; each
// frame we blend it between the two endpoint colors.
const SKY_DARK = new THREE.Color('#0b0b14')  // near-black stormy night
const SKY_FLASH = new THREE.Color('#dfe6ff') // blinding blue-white
const sky = SKY_DARK.clone()
scene.background = sky

// Mutable strike state
let flashStartedAt = -Infinity              // elapsed time of last strike
let nextFlashAt = 2.5                       // first strike ~2.5s in

/**
 * Camera
 */
const camera = new THREE.PerspectiveCamera(
    75,                          // field of view in degrees
    sizes.width / sizes.height,  // aspect ratio
    0.1,                         // near clipping plane (closer = invisible)
    100                          // far clipping plane (farther = invisible)
)
camera.position.set(3, 2.5, 5) // back, up, and to the side
scene.add(camera)

/**
 * Controls
 * OrbitControls: left-drag to orbit, right-drag to pan, scroll to zoom
 */
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true // smooth, inertia-like camera movement
controls.target.set(0, 0.5, 0) // orbit around the ball, not the origin

/**
 * First-person walking (arrow keys)
 * ------------------------------------------------------------
 * Mouse = look (OrbitControls), arrows = walk:
 *   ↑ / ↓   walk forward / backward, along where you're looking
 *   ← / →   strafe left / right
 *
 * The trick that lets walking coexist with OrbitControls: move
 * the camera AND controls.target by the SAME amount. That keeps
 * the camera→target relationship intact, so mouse-look still
 * orbits normally — it's exactly what OrbitControls' own "pan"
 * does internally.
 */
const WALK_SPEED = 1.5   // units per second — an uneasy walking pace
const EDGE_MARGIN = 0.4  // how close you can get to the floor edge / wall

// Track which keys are currently held. keydown adds, keyup removes —
// checking the Set every frame gives smooth, continuous movement
// (reacting to keydown events directly would stutter).
const heldKeys = new Set<string>()

window.addEventListener('keydown', (event) => {
    if (event.key.startsWith('Arrow')) {
        event.preventDefault() // arrows shouldn't scroll the page
        heldKeys.add(event.key)
    }
})
window.addEventListener('keyup', (event) => heldKeys.delete(event.key))
// If the tab loses focus mid-keypress, keyup never fires — release all
window.addEventListener('blur', () => heldKeys.clear())

// Scratch vectors, created ONCE and reused every frame.
// Allocating new objects inside the render loop pressures the
// garbage collector and causes stutters — a core Three.js habit.
const walkForward = new THREE.Vector3()
const walkRight = new THREE.Vector3()
const walkMove = new THREE.Vector3()
const WORLD_UP = new THREE.Vector3(0, 1, 0)

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true, // smooths jagged edges
})
renderer.setSize(sizes.width, sizes.height)
// Cap pixel ratio at 2 — higher values cost performance with little visual gain
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

// Shadows are off by default; enable them on the renderer too
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap // softer shadow edges

/**
 * Handle window resizing
 */
window.addEventListener('resize', () => {
    // Update stored sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    // Update camera — must call updateProjectionMatrix after changing aspect
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Animation loop
 * Clock gives us elapsed time in seconds — animating with time
 * (instead of "+= 0.01 per frame") keeps the speed identical on
 * slow and fast monitors.
 */
const clock = new THREE.Clock()

// Tuning knobs for the creep factor
const CRAWL_SPEED = 0.06   // units per second — glacially slow
const WALL_TOP = 4         // wall is 4 units tall; reset above this
const SWAY_AMOUNT = 0.15   // how far it drifts side to side
const SWAY_SPEED = 0.3     // how fast the drift oscillates

// Ball movement
const BALL_RADIUS = 0.5    // must match the SphereGeometry radius
const ROLL_RANGE = 2       // how far the ball rolls from center
const ROLL_SPEED = 0.2     // oscillations per second-ish — keep it slow

const tick = () => {
    const delta = clock.getDelta()    // seconds since last frame
    const elapsed = clock.elapsedTime // seconds since start

    // --- First-person walking ---
    // Forward = the direction the camera faces, flattened onto the
    // floor plane (y = 0) so looking up doesn't make you fly.
    camera.getWorldDirection(walkForward)
    walkForward.y = 0
    walkForward.normalize()
    // Right is perpendicular to forward and up (cross product)
    walkRight.crossVectors(walkForward, WORLD_UP)

    walkMove.set(0, 0, 0)
    if (heldKeys.has('ArrowUp')) walkMove.add(walkForward)
    if (heldKeys.has('ArrowDown')) walkMove.sub(walkForward)
    if (heldKeys.has('ArrowRight')) walkMove.add(walkRight)
    if (heldKeys.has('ArrowLeft')) walkMove.sub(walkRight)

    if (walkMove.lengthSq() > 0) {
        // normalize() so walking diagonally isn't faster than straight
        walkMove.normalize().multiplyScalar(WALK_SPEED * delta)

        // Clamp the step so you stay on the floor and out of the wall:
        // work out where we'd land, pull it back into bounds, and keep
        // only the allowed portion of the step. Floor is 10x10 with the
        // wall at z = -5.
        walkMove.add(camera.position) // walkMove is now the landing spot
        walkMove.x = THREE.MathUtils.clamp(walkMove.x, -5 + EDGE_MARGIN, 5 - EDGE_MARGIN)
        walkMove.z = THREE.MathUtils.clamp(walkMove.z, -5 + EDGE_MARGIN, 5 - EDGE_MARGIN)
        walkMove.sub(camera.position) // back to a (possibly shortened) step

        // Move body and look-target together — mouse-look stays intact
        camera.position.add(walkMove)
        controls.target.add(walkMove)
    }

    // --- Ball movement ---
    // Slowly roll back and forth along X. Math.sin oscillates
    // between -1 and 1 forever, so this never needs resetting.
    ball.position.x = Math.sin(elapsed * ROLL_SPEED) * ROLL_RANGE

    // Roll, don't slide: for a sphere, rotation = distance / radius
    // (radians). Negative so the spin direction matches the motion.
    ball.rotation.z = -ball.position.x / BALL_RADIUS

    // --- Creepy shadow crawl ---
    // Rise painfully slowly. Loop back to the floor once the
    // shadow slips past the top of the wall, so it climbs forever.
    const climb = (elapsed * CRAWL_SPEED) % (WALL_TOP - shadowStart.y + 1)
    wallShadow.position.y = shadowStart.y + climb

    // Drift slightly side to side, like something searching
    wallShadow.position.x =
        shadowStart.x + Math.sin(elapsed * SWAY_SPEED) * SWAY_AMOUNT

    // Stretch taller and thinner as it rises — shadows that
    // elongate as they move feel distinctly wrong
    const stretch = 1 + climb * 0.25
    wallShadow.scale.set(1 / stretch, stretch, 1)

    // Slow "breathing" of the darkness itself
    wallShadow.material.opacity = 0.75 + Math.sin(elapsed * 0.8) * 0.25

    // --- Lightning ---
    // Time for a new strike? Start it and schedule the next one
    // at a random interval (predictable rhythm isn't scary).
    if (elapsed >= nextFlashAt) {
        flashStartedAt = elapsed
        nextFlashAt = elapsed +
            FLASH_EVERY_MIN + Math.random() * (FLASH_EVERY_MAX - FLASH_EVERY_MIN)

        // The vampire waits somewhere new along the wall each strike
        vampire.position.x = (Math.random() - 0.5) * 6
    }

    // Flash brightness envelope: two decaying spikes, like a strike
    // followed by its immediate re-strike. Math.exp(-t * 10) drops
    // from 1 to almost 0 in a few tenths of a second — nice and sharp.
    const flashAge = elapsed - flashStartedAt
    let flash = 0
    if (flashAge < FLASH_DURATION) {
        const spike = (t: number) => (t < 0 ? 0 : Math.exp(-t * 10))
        flash = Math.min(1, spike(flashAge) + 0.6 * spike(flashAge - 0.25))
    }

    // Over-expose: drive the lights far past their normal values so
    // surfaces clip to white, and slam the sky toward the flash color
    directionalLight.intensity = BASE_DIR_INTENSITY + flash * 12
    ambientLight.intensity = BASE_AMBIENT_INTENSITY + flash * 4
    sky.lerpColors(SKY_DARK, SKY_FLASH, flash)

    // The vampire exists only in the first 0.3s of a strike —
    // by the time your eyes adjust, it's gone
    vampire.visible = flashAge < VAMPIRE_REVEAL

    // Required each frame when enableDamping is true
    controls.update()

    // Draw the scene from the camera's point of view
    renderer.render(scene, camera)

    // Ask the browser to call tick again on the next frame
    window.requestAnimationFrame(tick)
}

tick()
