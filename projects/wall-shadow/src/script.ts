import * as THREE from 'three'
import { Timer } from 'three/examples/jsm/misc/Timer.js'
import { createLightning } from './lightning'
import type { SilhouetteController } from './meshes/silhouette'
import { createVampirePoses } from './meshes/vampirePoses'
import { createBushes } from './meshes/bushes'
import { ReplayController } from './replay'
import type { IFloorTexture, FloorTextureFactory } from './materials/IFloorTexture'
import { createFloorTexture } from './materials/floorTexture'
import type { IWallTexture, WallTextureFactory } from './materials/IWallTexture'
import { createWallTexture } from './materials/wallTexture'
import { VirtualTour } from './virtualTour'

const canvas = document.querySelector('canvas.webgl')

if (!(canvas instanceof HTMLCanvasElement))
{
    throw new Error('Canvas element not found')
}

const scene = new THREE.Scene()

const ambientLight = new THREE.AmbientLight(0xffffff, 0.15)
scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight(0xd4e8ff, 2.5)
directionalLight.position.set(-6, 5, 8)

directionalLight.castShadow = true
directionalLight.shadow.mapSize.width = 2048
directionalLight.shadow.mapSize.height = 2048
directionalLight.shadow.camera.near = 1
directionalLight.shadow.camera.far = 50
directionalLight.shadow.camera.left = -12
directionalLight.shadow.camera.right = 12
directionalLight.shadow.camera.top = 12
directionalLight.shadow.camera.bottom = -12

scene.add(directionalLight)

const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 64, 64),
    new THREE.MeshStandardMaterial({
        color: 0x7a7a80,
        roughness: 0.85,
        metalness: 0.05,
    }),
)
ball.position.set(0, 0, 1.5)

ball.castShadow = true
ball.receiveShadow = true

// Floor plane size (world units) — geometry and texture tiling share these
const FLOOR_SIZE = 20
/** World units per square map stamp; larger = fewer, bigger rocks. */
const FLOOR_TILE_SIZE = 5
// Segments so displacement has vertices to move (haunted-house uses 200×200)
const FLOOR_SEGMENTS = 64

const floorTextureFactory: FloorTextureFactory = createFloorTexture
const floorTexture: IFloorTexture = floorTextureFactory({
    width: FLOOR_SIZE,
    height: FLOOR_SIZE,
    tileSize: FLOOR_TILE_SIZE,
    // Soft circular edge + mossy rock PBR (same as haunted-house-optimization)
    useAlpha: true,
})

const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE, FLOOR_SEGMENTS, FLOOR_SEGMENTS),
    floorTexture.material,
)
floor.receiveShadow = true

floor.rotation.x = -Math.PI / 2
floor.position.y = -0.6

scene.add(ball, floor)

// Wall plane size (world units) — geometry and texture tiling share these
const WALL_WIDTH = 20
const WALL_HEIGHT = 12
const WALL_Z = -3.5
/** World units per square map stamp; larger = fewer, bigger bricks. */
const WALL_TILE_SIZE = 7

// Composition root: inject which wall look to use (swap factory to change look)
const wallTextureFactory: WallTextureFactory = createWallTexture
const wallTexture: IWallTexture = wallTextureFactory({
    width: WALL_WIDTH,
    height: WALL_HEIGHT,
    tileSize: WALL_TILE_SIZE,
    // → repeat ≈ [20/7, 12/7] ≈ [2.86, 1.71] — same stamp size on X and Y
})

const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(WALL_WIDTH, WALL_HEIGHT),
    wallTexture.material,
)

wall.position.set(0, 5, WALL_Z)
wall.receiveShadow = true
scene.add(ball, floor, wall)

// Bushes — end clusters only (no along-wall row).
// minDistanceFromCenter keeps them outside a gap around the wall midline.
// Escape hatch: pass `instances: [...]` instead.
const bushes = createBushes({
    wall: {
        width: WALL_WIDTH,
        z: WALL_Z,
        floorY: -0.6,
    },
    sides: 'both',
    countPerSide: { left: 3, right: 2 },
    sideClusterRadius: 0.55,
    // Wall half-width = 10; require |x| >= 7.5 → only outer ends
    minDistanceFromCenter: 5.5,
    along: false,
    offsetFromWall: 0.35,
    marginFromEdge: 0.5,
    scale: { min: 1.3, max: 1.75 },
    seed: 42,
})
scene.add(bushes.group)

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
}

const FLOOR_Y = -0.6
const EYE_HEIGHT = 1.6

const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
scene.add(camera)

// Virtual tour: pointer-lock look + walk, clamped to the floor / wall
const tourBlocker = document.querySelector('#tour-blocker')
const tourStart = document.querySelector('#tour-start')

const tour = new VirtualTour(
    { camera, domElement: document.body },
    {
        floorY: FLOOR_Y,
        eyeHeight: EYE_HEIGHT,
        walkSpeed: 2.4,
        // Floor is 20×20; wall sits at z = -3.5 — stay in front of it
        bounds: {
            minX: -9,
            maxX: 9,
            minZ: -3,
            maxZ: 9,
        },
        blocker: tourBlocker instanceof HTMLElement ? tourBlocker : null,
        startTarget: tourStart instanceof HTMLElement ? tourStart : null,
    },
)

window.addEventListener('resize', () =>
{
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

const renderer = new THREE.WebGLRenderer({
    canvas,
})

renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const timer = new Timer()

const lightning = createLightning(
    { directional: directionalLight, ambient: ambientLight },
    {
        duration: 0.8,
        frequency: { min: 4, max: 10 },
        doubleFlash: { delay: 0.12, intensity: 0.85 },
        directionalBoost: 35,
        ambientBoost: 2.5,
    },
)

let silhouette: SilhouetteController = {
    group: new THREE.Group(),
    update: () => {},
}

const replay = new ReplayController({
    ball,
    directionalLight,
    timer,
    lightning,
    getSilhouette: () => silhouette,
})

const replayButton = document.querySelector('#replay')

if (replayButton instanceof HTMLElement)
{
    replay.bindButton(replayButton)
}

// Two-pose vampire: image A→B + wall area change on lightning.
// UV positions: (0,0) bottom-left … (1,1) top-right of the wall plane.
// maxAbsX keeps the figure out of the end-bush band.
createVampirePoses({
    wall,
    wallSize: { width: WALL_WIDTH, height: WALL_HEIGHT },
    poseAUrl: '../assets/vampire_nosferatu_silhoutte_A.png',
    poseBUrl: '../assets/vampire_nosferatu_silhoutte_B.png',
    scale: 1.2,
    height: 6,
    // Default home if relocate is off; also fallback when slots empty
    position: { u: 0.45, v: 0.4 },
    // Step during double-flash (relative to this strike's home)
    poseBOffset: { x: 1.5, y: 0.1, z: 0 },
    // New home each strike (safe center band)
    relocateEachStrike: true,
    slots: [
        { u: 0.35, v: 0.4 },
        { u: 0.5, v: 0.38 },
        { u: 0.65, v: 0.4 },
    ],
    maxAbsX: 5,
    swapAfter: 0.12,
}).then((result) =>
{
    silhouette = result
    silhouette.update({
        ...replay.getState(),
        exposure: lightning.getExposure(),
        delta: 0,
    })
}).catch((error: unknown) =>
{
    console.error('Vampire poses failed to load:', error)
})

const tick = () =>
{
    timer.update()
    const elapsedTime = timer.getElapsed()
    const delta = timer.getDelta()

    tour.update(delta)

    replay.update(elapsedTime)

    lightning.update(elapsedTime, delta)
    silhouette.update({
        ...replay.getState(),
        exposure: lightning.getExposure(),
        delta,
    })

    renderer.render(scene, camera)

    window.requestAnimationFrame(tick)
}

tick()