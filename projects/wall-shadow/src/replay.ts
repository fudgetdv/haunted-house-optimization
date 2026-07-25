import type { DirectionalLight, Mesh } from 'three'
import { Vector3 } from 'three'
import type { Timer } from 'three/examples/jsm/misc/Timer.js'
import type { LightningController } from './lightning'
import type { SilhouetteController } from './meshes/silhouette'

export type ReplayState = {
    phase: number
    growth: number
    maxGrowth: number
}

export type ReplayOptions = {
    maxGrowth?: number
    ballRollSpeed?: number
    ballPhaseSwitchZ?: number
    growthRate?: number
    lightWobbleSpeed?: number
    lightWobbleAmplitude?: number
}

type ReplayDependencies = {
    ball: Mesh
    directionalLight: DirectionalLight
    timer: Timer
    lightning: LightningController
    getSilhouette: () => SilhouetteController
}

const DEFAULT_OPTIONS = {
    maxGrowth: 7.5,
    ballRollSpeed: 0.008,
    ballPhaseSwitchZ: -2.0,
    growthRate: 0.0022,
    lightWobbleSpeed: 2.2,
    lightWobbleAmplitude: 0.25,
} satisfies Required<ReplayOptions>

export class ReplayController
{
    phase = 0
    growth = 0
    readonly maxGrowth: number

    private readonly ball: Mesh
    private readonly directionalLight: DirectionalLight
    private readonly timer: Timer
    private readonly lightning: LightningController
    private readonly getSilhouette: () => SilhouetteController
    private readonly initialBallPosition: Vector3
    private readonly initialLightPosition: Vector3
    private readonly ballRollSpeed: number
    private readonly ballPhaseSwitchZ: number
    private readonly growthRate: number
    private readonly lightWobbleSpeed: number
    private readonly lightWobbleAmplitude: number

    constructor(deps: ReplayDependencies, options: ReplayOptions = {})
    {
        const config = { ...DEFAULT_OPTIONS, ...options }

        this.ball = deps.ball
        this.directionalLight = deps.directionalLight
        this.timer = deps.timer
        this.lightning = deps.lightning
        this.getSilhouette = deps.getSilhouette

        this.maxGrowth = config.maxGrowth
        this.ballRollSpeed = config.ballRollSpeed
        this.ballPhaseSwitchZ = config.ballPhaseSwitchZ
        this.growthRate = config.growthRate
        this.lightWobbleSpeed = config.lightWobbleSpeed
        this.lightWobbleAmplitude = config.lightWobbleAmplitude

        this.initialBallPosition = deps.ball.position.clone()
        this.initialLightPosition = deps.directionalLight.position.clone()
    }

    getState(): ReplayState
    {
        return {
            phase: this.phase,
            growth: this.growth,
            maxGrowth: this.maxGrowth,
        }
    }

    replay(): void
    {
        this.phase = 0
        this.growth = 0

        this.ball.position.copy(this.initialBallPosition)
        this.directionalLight.position.copy(this.initialLightPosition)

        this.timer.reset()
        this.lightning.reset()

        this.getSilhouette().update({
            phase: this.phase,
            growth: this.growth,
            maxGrowth: this.maxGrowth,
            exposure: this.lightning.getExposure(),
        })
    }

    update(elapsedTime: number): void
    {
        if (this.phase === 0)
        {
            this.ball.position.z -= this.ballRollSpeed

            if (this.ball.position.z <= this.ballPhaseSwitchZ)
            {
                this.phase = 1
            }
        }

        if (this.phase === 1 && this.growth < this.maxGrowth)
        {
            this.growth += this.growthRate

            this.directionalLight.position.y = this.initialLightPosition.y - this.growth * 1.15
            this.directionalLight.position.x = this.initialLightPosition.x
                + 1
                + Math.sin(elapsedTime * this.lightWobbleSpeed) * this.lightWobbleAmplitude
        }
    }

    bindButton(button: HTMLElement): void
    {
        button.addEventListener('click', () => this.replay())
    }
}