import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Timer } from 'three/examples/jsm/misc/Timer.js'
import { createLightning } from './lightning'
import { createSilhouette, type SilhouetteController } from './silhoutte'
import { ReplayController } from './replay'

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

const material = new THREE.MeshStandardMaterial({
    color: 0x1f2128,
    roughness: 0.9,
    metalness: 0.1,
})

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

const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    material,
)
floor.receiveShadow = true

floor.rotation.x = -Math.PI / 2
floor.position.y = -0.6

scene.add(ball, floor)

const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 12),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1f }),
)

wall.position.set(0, 5, -3.5)
wall.receiveShadow = true
scene.add(ball, floor, wall)

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
}

const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
camera.position.set(0, 2, 8)
scene.add(camera)

window.addEventListener('resize', () =>
{
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

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

createSilhouette(scene, {
    source: 'png',
    url: '../assets/vampire_nosferatu_silhoutte.png',
    wall,
    scale: 1.2,
    height: 6,
}).then((result) =>
{
    silhouette = result
    silhouette.update({
        ...replay.getState(),
        exposure: lightning.getExposure(),
    })
}).catch((error: unknown) =>
{
    console.error('Silhouette failed to load:', error)
})

const tick = () =>
{
    timer.update()
    const elapsedTime = timer.getElapsed()
    const delta = timer.getDelta()

    controls.update()

    replay.update(elapsedTime)

    lightning.update(elapsedTime, delta)
    silhouette.update({
        ...replay.getState(),
        exposure: lightning.getExposure(),
    })

    renderer.render(scene, camera)

    window.requestAnimationFrame(tick)
}

tick()