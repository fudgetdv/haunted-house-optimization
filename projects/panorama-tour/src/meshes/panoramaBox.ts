import * as THREE from 'three'

/**
 * Six cube faces for a proper box panorama.
 * Paths are served from Vite `static/` (e.g. `./panorama/px.jpg`).
 */
export type PanoramaCubeFaces = {
    px: string
    nx: string
    py: string
    ny: string
    pz: string
    nz: string
}

/**
 * - `equirect` — 2:1 360×180 photo on a sphere, or auto cylinder if image is wider
 * - `cube` — six cube faces on a box
 */
export type PanoramaMode = 'equirect' | 'cube'

export type PanoramaBoxOptions = {
    mode?: PanoramaMode
    /** World diameter of the environment. Default 40. */
    size?: number
    /**
     * Single panorama image.
     * - ~2:1 → full equirectangular sphere
     * - much wider (e.g. phone pano ~5–6:1) → cylinder so it isn’t squished
     */
    textureUrl?: string
    faces?: PanoramaCubeFaces
    position?: THREE.Vector3 | [number, number, number]
    loader?: THREE.TextureLoader
    fallbackColor?: THREE.ColorRepresentation
    /**
     * Horizontal mirror. Default **true** (BackSide inside view otherwise looks mirrored).
     * Set `false` only if left/right already look correct.
     */
    flipX?: boolean
    /** Vertical mirror (upside-down). Default false. */
    flipY?: boolean
    rotationY?: number
    /**
     * Force projection when mode is equirect:
     * - `auto` (default) — pick sphere vs cylinder from image aspect
     * - `sphere` — always full equirect sphere
     * - `cylinder` — always cylindrical band
     */
    projection?: 'auto' | 'sphere' | 'cylinder'
}

export type PanoramaBoxController = {
    /** Root object (mesh or group with cylinder + sky/ground caps). */
    readonly mesh: THREE.Object3D
    readonly size: number
    readonly mode: PanoramaMode
    readonly projection: 'sphere' | 'cylinder' | 'cube'
    dispose: () => void
}

const DEFAULT_SIZE = 40
const DEFAULT_FALLBACK = 0x1a1a24
/** Aspects above this are treated as cylindrical (phone) panos, not 2:1 equirect. */
const CYLINDER_ASPECT_THRESHOLD = 2.35

const FACE_KEYS: (keyof PanoramaCubeFaces)[] = [
    'px',
    'nx',
    'py',
    'ny',
    'pz',
    'nz',
]

function applyPosition(
    object: THREE.Object3D,
    position?: THREE.Vector3 | [number, number, number]
): void {
    if (!position) return
    if (Array.isArray(position)) {
        object.position.set(position[0], position[1], position[2])
    } else {
        object.position.copy(position)
    }
}

function getImageSize(texture: THREE.Texture): { width: number; height: number } {
    const img = texture.image as
        | { width?: number; height?: number; videoWidth?: number; videoHeight?: number }
        | undefined
    const width = img?.width ?? img?.videoWidth ?? 2
    const height = img?.height ?? img?.videoHeight ?? 1
    return { width, height }
}

/**
 * Average RGB along a horizontal band of the image (for sky/ground caps).
 */
function sampleRowColor(
    image: CanvasImageSource & { width: number; height: number },
    rowStart: number,
    rowCount: number,
): THREE.Color {
    const canvas = document.createElement('canvas')
    const sampleW = Math.min(image.width, 128)
    const sampleH = Math.min(rowCount, 8)
    canvas.width = sampleW
    canvas.height = sampleH
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
        return new THREE.Color(DEFAULT_FALLBACK)
    }

    const sy = Math.max(0, Math.min(image.height - sampleH, rowStart))
    ctx.drawImage(
        image,
        0,
        sy,
        image.width,
        sampleH,
        0,
        0,
        sampleW,
        sampleH,
    )
    const data = ctx.getImageData(0, 0, sampleW, sampleH).data
    let r = 0
    let g = 0
    let b = 0
    const n = sampleW * sampleH
    for (let i = 0; i < data.length; i += 4) {
        r += data[i]!
        g += data[i + 1]!
        b += data[i + 2]!
    }
    return new THREE.Color(r / n / 255, g / n / 255, b / n / 255)
}

/**
 * Panorama environment.
 *
 * True equirectangular (≈2:1) → sphere.
 * Wide cylindrical phone panos → cylinder (correct aspect) + sky/ground caps
 * so looking up/down isn’t empty black.
 */
export async function createPanoramaBox(
    options: PanoramaBoxOptions = {}
): Promise<PanoramaBoxController> {
    const size = options.size ?? DEFAULT_SIZE
    const loader = options.loader ?? new THREE.TextureLoader()
    const fallbackColor = options.fallbackColor ?? DEFAULT_FALLBACK
    const mode: PanoramaMode =
        options.mode ?? (options.faces ? 'cube' : 'equirect')
    const radius = size / 2
    const projectionPreference = options.projection ?? 'auto'

    const textures: THREE.Texture[] = []
    const disposables: Array<{ dispose: () => void }> = []
    let materials: THREE.MeshBasicMaterial[] = []
    let projection: 'sphere' | 'cylinder' | 'cube' = 'sphere'

    const root = new THREE.Group()
    root.name = 'panorama-root'

    const makeBasic = (color: THREE.ColorRepresentation = fallbackColor) =>
        new THREE.MeshBasicMaterial({
            color,
            side: THREE.BackSide,
            depthWrite: false,
        })

    let shell: THREE.Mesh

    if (mode === 'cube') {
        projection = 'cube'
        const geometry = new THREE.BoxGeometry(size, size, size)
        materials = FACE_KEYS.map(() => makeBasic())
        shell = new THREE.Mesh(geometry, materials)
        shell.name = 'panorama-box'
        disposables.push(geometry)
        materials.forEach((m) => disposables.push(m))
    } else {
        const geometry = new THREE.SphereGeometry(radius, 64, 48)
        materials = [makeBasic()]
        shell = new THREE.Mesh(geometry, materials)
        shell.name = 'panorama-sphere'
        projection = 'sphere'
        disposables.push(geometry)
        materials.forEach((m) => disposables.push(m))
    }

    shell.renderOrder = -1
    shell.frustumCulled = false
    root.add(shell)

    applyPosition(root, options.position)
    if (options.rotationY) {
        root.rotation.y = options.rotationY
    }

    const trackTexture = (texture: THREE.Texture) => {
        if (!textures.includes(texture)) {
            textures.push(texture)
        }
        texture.colorSpace = THREE.SRGBColorSpace
        texture.wrapS = THREE.ClampToEdgeWrapping
        texture.wrapT = THREE.ClampToEdgeWrapping
    }

    const loadUrl = (url: string) =>
        new Promise<THREE.Texture>((resolve, reject) => {
            loader.load(url, (tex) => resolve(tex), undefined, (err) => reject(err))
        })

    const clearCaps = () => {
        const caps = root.children.filter((c) => c.name.startsWith('panorama-cap-'))
        for (const cap of caps) {
            root.remove(cap)
            if (cap instanceof THREE.Mesh) {
                cap.geometry.dispose()
                const mat = cap.material
                if (Array.isArray(mat)) {
                    mat.forEach((m) => m.dispose())
                } else {
                    mat.dispose()
                }
            }
        }
    }

    /**
     * Closed cylinder: photo on the wall + solid caps from image edge colors
     * so looking above/below the band isn’t black void.
     */
    const rebuildAsCylinder = (
        aspect: number,
        skyColor: THREE.Color,
        groundColor: THREE.Color,
    ) => {
        clearCaps()

        const verticalRadians = (Math.PI * 2) / aspect
        const height = radius * verticalRadians

        const oldGeo = shell.geometry
        oldGeo.dispose()

        const geometry = new THREE.CylinderGeometry(
            radius,
            radius,
            height,
            64,
            1,
            true,
        )
        disposables.push(geometry)

        const material = materials[0] ?? makeBasic(0xffffff)
        materials = [material]
        shell.geometry = geometry
        shell.material = material
        shell.name = 'panorama-cylinder'
        projection = 'cylinder'

        // Inward-facing discs: top (sky) and bottom (ground)
        const capGeo = new THREE.CircleGeometry(radius * 0.999, 48)
        disposables.push(capGeo)

        const topMat = new THREE.MeshBasicMaterial({
            color: skyColor,
            side: THREE.DoubleSide,
            depthWrite: false,
        })
        const bottomMat = new THREE.MeshBasicMaterial({
            color: groundColor,
            side: THREE.DoubleSide,
            depthWrite: false,
        })
        disposables.push(topMat, bottomMat)

        const top = new THREE.Mesh(capGeo, topMat)
        top.name = 'panorama-cap-sky'
        top.position.y = height / 2 - 0.01
        // Face inward (down toward viewer)
        top.rotation.x = Math.PI / 2
        top.renderOrder = -2

        const bottom = new THREE.Mesh(capGeo, bottomMat)
        bottom.name = 'panorama-cap-ground'
        bottom.position.y = -height / 2 + 0.01
        // Face inward (up toward viewer)
        bottom.rotation.x = -Math.PI / 2
        bottom.renderOrder = -2

        root.add(top, bottom)
    }

    const rebuildAsSphere = () => {
        clearCaps()
        const oldGeo = shell.geometry
        oldGeo.dispose()

        const geometry = new THREE.SphereGeometry(radius, 64, 48)
        disposables.push(geometry)
        const material = materials[0] ?? makeBasic(0xffffff)
        materials = [material]
        shell.geometry = geometry
        shell.material = material
        shell.name = 'panorama-sphere'
        projection = 'sphere'
    }

    const applyEquirectTexture = (texture: THREE.Texture) => {
        trackTexture(texture)

        const { width, height } = getImageSize(texture)
        const aspect = width / Math.max(height, 1)
        const image = texture.image as HTMLImageElement | ImageBitmap

        const useCylinder =
            projectionPreference === 'cylinder' ||
            (projectionPreference === 'auto' && aspect > CYLINDER_ASPECT_THRESHOLD)

        if (mode === 'equirect') {
            if (useCylinder) {
                const sky = sampleRowColor(
                    image as HTMLImageElement,
                    0,
                    Math.max(2, Math.floor(height * 0.04)),
                )
                const ground = sampleRowColor(
                    image as HTMLImageElement,
                    Math.max(0, height - Math.max(2, Math.floor(height * 0.04))),
                    Math.max(2, Math.floor(height * 0.04)),
                )
                rebuildAsCylinder(aspect, sky, ground)
                console.info(
                    `[Panorama] ${width}×${height} (aspect ${aspect.toFixed(2)}) → cylinder + caps ` +
                        `(sky/ground fill so up/down isn’t black)`
                )
            } else {
                rebuildAsSphere()
                if (projectionPreference === 'auto' && Math.abs(aspect - 2) > 0.15) {
                    console.warn(
                        `[Panorama] ${width}×${height} (aspect ${aspect.toFixed(2)}) on sphere. ` +
                            `True equirect is ~2:1; distortion is possible.`
                    )
                }
            }
        }

        const flipX = options.flipX !== false
        if (flipX) {
            texture.wrapS = THREE.RepeatWrapping
            texture.repeat.x = -1
            texture.offset.x = 1
        }

        if (options.flipY) {
            texture.wrapT = THREE.RepeatWrapping
            texture.repeat.y = -1
            texture.offset.y = 1
        }

        const material = materials[0]!
        material.map = texture
        material.color.set(0xffffff)
        material.side = THREE.BackSide
        material.needsUpdate = true
    }

    const loadCubeFaces = async (faces: PanoramaCubeFaces) => {
        try {
            const loaded = await Promise.all(
                FACE_KEYS.map((key) => loadUrl(faces[key]))
            )
            loaded.forEach((texture, i) => {
                trackTexture(texture)
                const material = materials[i]!
                material.map = texture
                material.color.set(0xffffff)
                material.needsUpdate = true
            })
        } catch (error) {
            console.warn(
                '[Panorama] Failed to load one or more cube faces. Using fallback color.',
                error
            )
        }
    }

    if (options.faces && mode === 'cube') {
        await loadCubeFaces(options.faces)
    } else if (options.textureUrl) {
        if (mode === 'equirect') {
            try {
                const texture = await loadUrl(options.textureUrl)
                applyEquirectTexture(texture)
            } catch (error) {
                console.warn(
                    `[Panorama] Failed to load "${options.textureUrl}". Using fallback color.`,
                    error
                )
            }
        } else {
            console.warn(
                '[Panorama] Single textureUrl with cube mode is unsupported. Use faces or equirect.'
            )
        }
    }

    const dispose = () => {
        clearCaps()
        root.removeFromParent()
        for (const texture of textures) {
            texture.dispose()
        }
        shell.geometry.dispose()
        for (const material of materials) {
            material.map?.dispose()
            material.dispose()
        }
    }

    return {
        mesh: root,
        size,
        mode,
        projection,
        dispose,
    }
}
