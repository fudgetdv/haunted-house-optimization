import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

const PNG_URL = new URL('../assets/vampire_nosferatu_silhoutte.png', import.meta.url).href
const SVG_URL = new URL('../assets/vampire_nosferatu_silhouette.svg', import.meta.url).href

const KNOWN_ASSETS: Record<string, string> = {
    '../assets/vampire_nosferatu_silhoutte.png': PNG_URL,
    '../assets/vampire_nosferatu_silhouette.svg': SVG_URL,
}

type SilhouetteSource = 'png' | 'svg'

type SilhouetteOffset = {
    x: number
    y: number
    z: number
}

export type SilhouetteUpdateParams = {
    exposure?: number
    phase?: number
    growth?: number
    maxGrowth?: number
}

export type SilhouetteOptions = {
    wall: THREE.Mesh
    source?: SilhouetteSource
    url?: string
    scale?: number
    height?: number
    offset?: SilhouetteOffset
}

export type SilhouetteController = {
    group: THREE.Group
    update: (params: SilhouetteUpdateParams) => void
}

const DEFAULT_OPTIONS = {
    source: 'png',
    url: '../assets/vampire_nosferatu_silhoutte.png',
    scale: 1.2,
    height: 6,
    offset: { x: 0.5, y: 0, z: 0.01 },
} satisfies Omit<SilhouetteOptions, 'wall'>

const resolveAssetUrl = (source: SilhouetteSource, url?: string): string =>
{
    if (url && KNOWN_ASSETS[url])
    {
        return KNOWN_ASSETS[url]
    }

    return source === 'svg' ? SVG_URL : PNG_URL
}

const silhouetteMaterial = () =>
    new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.FrontSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
    })

const normalizeMesh = (mesh: THREE.Object3D, targetHeight: number): boolean =>
{
    const box = new THREE.Box3().setFromObject(mesh)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())

    if (size.y === 0)
    {
        return false
    }

    mesh.position.sub(center)

    const scale = targetHeight / size.y
    mesh.scale.set(scale, -scale, scale)

    return true
}

function cleanPngTexture(image: HTMLImageElement | HTMLCanvasElement | ImageBitmap)
{
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height

    const context = canvas.getContext('2d')

    if (!context)
    {
        throw new Error('Could not get 2D canvas context')
    }

    context.drawImage(image, 0, 0)

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const pixels = imageData.data

    for (let i = 0; i < pixels.length; i += 4)
    {
        const red = pixels[i]!
        const green = pixels[i + 1]!
        const blue = pixels[i + 2]!
        const alpha = pixels[i + 3]!

        const luminance = 0.299 * red + 0.587 * green + 0.114 * blue
        const isGray = Math.abs(red - green) < 25 && Math.abs(green - blue) < 25
        const isCheckerboard = isGray && luminance > 70
        const isTransparent = alpha < 25 || isCheckerboard

        if (isTransparent)
        {
            pixels[i] = 0
            pixels[i + 1] = 0
            pixels[i + 2] = 0
            pixels[i + 3] = 0
            continue
        }

        pixels[i] = 0
        pixels[i + 1] = 0
        pixels[i + 2] = 0
    }

    context.putImageData(imageData, 0, 0)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace

    return texture
}

async function buildFromPng(url: string, height: number)
{
    const textureLoader = new THREE.TextureLoader()
    const loadedTexture = await textureLoader.loadAsync(resolveAssetUrl('png', url))
    const texture = cleanPngTexture(loadedTexture.image)
    const aspect = texture.image.width / texture.image.height
    const geometry = new THREE.PlaneGeometry(height * aspect, height)
    const material = silhouetteMaterial()
    material.map = texture

    return new THREE.Mesh(geometry, material)
}

async function buildFromSvg(url: string, height: number)
{
    const loader = new SVGLoader()
    const svgData = await loader.loadAsync(resolveAssetUrl('svg', url))
    const meshGroup = new THREE.Group()

    for (const path of svgData.paths)
    {
        const material = silhouetteMaterial()

        for (const subPath of path.subPaths)
        {
            const shapes = SVGLoader.createShapes(subPath as unknown as Parameters<typeof SVGLoader.createShapes>[0])

            for (const shape of shapes)
            {
                const geometry = new THREE.ShapeGeometry(shape)
                const mesh = new THREE.Mesh(geometry, material)
                meshGroup.add(mesh)
            }
        }
    }

    if (meshGroup.children.length === 0 || !normalizeMesh(meshGroup, height))
    {
        throw new Error('Silhouette SVG produced no visible geometry')
    }

    return meshGroup
}

function placeOnWall(
    group: THREE.Group,
    wall: THREE.Mesh,
    { scale, offset }: Pick<SilhouetteOptions, 'scale' | 'offset'>,
)
{
    wall.add(group)
    group.position.set(offset!.x, offset!.y, offset!.z)
    group.scale.multiplyScalar(scale!)
}

export async function createSilhouette(
    _scene: THREE.Scene,
    options: SilhouetteOptions,
): Promise<SilhouetteController>
{
    const config = { ...DEFAULT_OPTIONS, ...options }
    const group = new THREE.Group()
    group.name = 'silhouette'
    group.renderOrder = 1

    const body = config.source === 'svg'
        ? await buildFromSvg(config.url, config.height)
        : await buildFromPng(config.url, config.height)

    body.name = 'body'
    group.add(body)
    placeOnWall(group, config.wall, config)

    const baseScale = group.scale.clone()

    group.visible = false
    setOpacity(group, 0)

    const update = ({ exposure = 0, phase = 0, growth = 0, maxGrowth = 7.5 }: SilhouetteUpdateParams) =>
    {
        if (phase < 1 || exposure <= 0.01)
        {
            group.visible = false
            setOpacity(group, 0)
            return
        }

        const brightness = exposure * exposure
        const scaleProgress = Math.min(growth / (maxGrowth * 0.5), 1)
        const revealScale = 0.8 + scaleProgress * 0.2

        group.visible = true
        group.scale.copy(baseScale).multiplyScalar(revealScale)
        setOpacity(group, brightness)
    }

    return { group, update }
}

function setOpacity(object: THREE.Object3D, opacity: number)
{
    object.traverse((child: THREE.Object3D) =>
    {
        if (!(child instanceof THREE.Mesh))
        {
            return
        }

        const { material } = child

        if (Array.isArray(material))
        {
            for (const entry of material)
            {
                entry.opacity = opacity
            }

            return
        }

        material.opacity = opacity
    })
}