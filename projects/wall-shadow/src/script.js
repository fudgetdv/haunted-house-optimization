import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Sky } from 'three/addons/objects/Sky.js'
import { Timer } from 'three/addons/misc/Timer.js'
import { ThreePerf } from 'three-perf'
import GUI from 'lil-gui'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

/**
 * Base
 */
// Debug
//const gui = new GUI()





// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scene
const scene = new THREE.Scene()

/**
 * Lights
 */
// Ambient light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.15)
//gui.add(ambientLight, 'intensity').min(0).max(3).step(0.001)
scene.add(ambientLight)


// Directional light
const directionalLight = new THREE.DirectionalLight(0xd4e8ff, 2.5)
directionalLight.position.set(-6, 5, 8)
//gui.add(directionalLight, 'intensity').min(0).max(3).step(0.001)
//gui.add(directionalLight.position, 'x').min(- 5).max(5).step(0.001)
//gui.add(directionalLight.position, 'y').min(- 5).max(5).step(0.001)
//gui.add(directionalLight.position, 'z').min(- 5).max(5).step(0.001)


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
//const helper = new THREE.CameraHelper(directionalLight.shadow.camera);
//scene.add(helper)

/**
 * Materials
 */
const material = new THREE.MeshStandardMaterial({ 
    color: 0x1f2128, 
    roughness: 0.9, 
    metalness: 0.1 
})

//gui.add(material, 'metalness').min(0).max(1).step(0.001)
//gui.add(material, 'roughness').min(0).max(1).step(0.001)

const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 64, 64),
    new THREE.MeshStandardMaterial({ 
        color: 0x7a7a80,      // desaturated gray
        roughness: 0.85,
        metalness: 0.05
    })
)
ball.position.set(0, 0, 1.5);

ball.castShadow = true
ball.receiveShadow = true

const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20,20),
    material
)
floor.receiveShadow = true

floor.rotation.x = -Math.PI / 2
floor.position.y = -0.6

scene.add(ball, floor)

const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 12),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1f })
)

wall.position.set(0, 5, -3.5)
wall.receiveShadow = true
scene.add(ball, floor, wall)


/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
camera.position.set(0, 2, 8)
scene.add(camera)


//const textureLoader = new THREE.TextureLoader()

//scene.add(floor)


// Controls
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
    canvas: canvas
})

renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap


/**
 * Animate
 */
const timer = new Timer()

// === VARIABLES FOR BALL MOVEMENT + CREEPING SHADOW ===
let phase = 0                    // 0 = ball rolling toward wall, 1 = shadow grows abnormally
let growth = 0
const maxGrowth = 7.5

const tick = () =>
{
    // Timer
    timer.update()
    const elapsedTime = timer.getElapsed()
    // Update controls
    controls.update()

    // ========================
    // BALL ROLLS TOWARD WALL
    // ========================
    if (phase === 0) {
        ball.position.z -= 0.008   // slow roll toward wall

        // When ball gets close enough, switch to shadow phase
        if (ball.position.z <= -2.0) {
            phase = 1
        }
    }

    // ========================
    // SHADOW GROWS ABNORMALLY
    // ========================
    if (phase === 1 && growth < maxGrowth) {
        growth += 0.0022

        // Abnormal growth (light lowers + slight wobble)
        directionalLight.position.y = 5 - growth * 1.15
        directionalLight.position.x = -5 + Math.sin(elapsedTime * 2.2) * 0.25
    }

    // Render
    //perf.begin()
    renderer.render(scene, camera)
    //perf.end()

    window.requestAnimationFrame(tick)
}
tick();