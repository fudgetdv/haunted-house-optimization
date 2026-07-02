import type { AmbientLight, DirectionalLight } from 'three'

type FrequencyRange = {
    min: number
    max: number
}

type DoubleFlashConfig = {
    delay: number
    intensity: number
}

export type LightningOptions = {
    duration?: number
    frequency?: number | FrequencyRange
    doubleFlash?: DoubleFlashConfig | false
    directionalBoost?: number
    ambientBoost?: number
    auto?: boolean
    listenForMessages?: boolean
}

type LightningLights = {
    directional: DirectionalLight
    ambient: AmbientLight
}

export type LightningController = {
    trigger: () => void
    update: (elapsedTime: number, delta: number) => void
    getExposure: () => number
    reset: () => void
}

const DEFAULT_OPTIONS = {
    duration: 0.8,
    frequency: { min: 4, max: 10 },
    doubleFlash: { delay: 0.12, intensity: 0.7 },
    directionalBoost: 10,
    ambientBoost: 0.8,
    auto: true,
    listenForMessages: true,
} satisfies Required<Pick<LightningOptions, 'duration' | 'frequency' | 'doubleFlash' | 'directionalBoost' | 'ambientBoost' | 'auto' | 'listenForMessages'>>

const resolveFrequency = (frequency: number | FrequencyRange): FrequencyRange =>
    typeof frequency === 'number'
        ? { min: frequency, max: frequency }
        : frequency

export function createLightning(
    lights: LightningLights,
    options: LightningOptions = {},
): LightningController
{
    const config = { ...DEFAULT_OPTIONS, ...options }
    const frequency = resolveFrequency(config.frequency)

    const { directional, ambient } = lights
    const baseDirectionalIntensity = directional.intensity
    const baseAmbientIntensity = ambient.intensity
    const baseDirectionalColor = directional.color.clone()

    let flash = 0
    let followUp = 0
    let nextStrikeTime = config.auto
        ? frequency.min + Math.random() * (frequency.max - frequency.min)
        : Infinity

    const scheduleNextStrike = (elapsedTime: number) =>
    {
        const gap = frequency.min + Math.random() * (frequency.max - frequency.min)
        nextStrikeTime = elapsedTime + gap
    }

    const trigger = () =>
    {
        flash = 1

        if (config.doubleFlash)
        {
            followUp = config.doubleFlash.delay
        }
    }

    const update = (elapsedTime: number, delta: number) =>
    {
        if (config.auto && elapsedTime >= nextStrikeTime)
        {
            trigger()
            scheduleNextStrike(elapsedTime)
        }

        if (followUp > 0)
        {
            followUp -= delta

            if (followUp <= 0 && config.doubleFlash)
            {
                flash = Math.max(flash, config.doubleFlash.intensity)
                followUp = 0
            }
        }

        if (flash <= 0)
        {
            return
        }

        const brightness = flash * flash

        directional.intensity = baseDirectionalIntensity + brightness * config.directionalBoost
        ambient.intensity = baseAmbientIntensity + brightness * config.ambientBoost
        directional.color.setHSL(0.58, 0.15, 0.95)

        const decayRate = -Math.log(0.02) / config.duration
        flash *= Math.exp(-decayRate * delta)

        if (flash < 0.02)
        {
            flash = 0
            directional.intensity = baseDirectionalIntensity
            ambient.intensity = baseAmbientIntensity
            directional.color.copy(baseDirectionalColor)
        }
    }

    if (config.listenForMessages)
    {
        window.addEventListener('message', (event: MessageEvent) =>
        {
            const data = event.data

            if (data === 'lightning' || data?.type === 'lightning')
            {
                trigger()
            }
        })
    }

    const getExposure = () => flash

    const reset = () =>
    {
        flash = 0
        followUp = 0
        nextStrikeTime = config.auto
            ? frequency.min + Math.random() * (frequency.max - frequency.min)
            : Infinity
        directional.intensity = baseDirectionalIntensity
        ambient.intensity = baseAmbientIntensity
        directional.color.copy(baseDirectionalColor)
    }

    return { trigger, update, getExposure, reset }
}