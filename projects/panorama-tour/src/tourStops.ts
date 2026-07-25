import type { HotspotDef } from './hotspots'

/**
 * Tour stops — backyard grid (equirectangular 360s, VirtualOutside).
 *
 * Files on disk: backyard_pano_r{row}c{col}.jpg
 * Capture assumption: every shot starts facing the same way (north = forward = -Z).
 *
 * Grid (row × col):
 *   r1c1  —  r1c2
 *   r2c1  —  r2c2
 *
 * Compass vectors (north-aligned capture) — author in this space:
 *   north [0,0,-1]  south [0,0,1]  east [1,0,0]  west [-1,0,0]
 * HotspotController mirrors X to match the flipped inside-view texture.
 */
export type TourStop = {
    id: string
    label: string
    textureUrl: string
    hotspots: HotspotDef[]
}

export const TOUR_STOPS: TourStop[] = [
    {
        id: 'r1c1',
        label: 'R1 C1',
        textureUrl: './panorama/backyard_pano_r1c1.jpg',
        hotspots: [
            {
                targetStopId: 'r1c2',
                label: 'East → R1 C2',
                direction: [1, 0, 0],
                distance: 6,
            },
            {
                targetStopId: 'r2c1',
                label: 'South → R2 C1',
                direction: [0, 0, 1],
                distance: 6,
            },
        ],
    },
    {
        id: 'r1c2',
        label: 'R1 C2',
        textureUrl: './panorama/backyard_pano_r1c2.jpg',
        hotspots: [
            {
                targetStopId: 'r1c1',
                label: 'West → R1 C1',
                direction: [-1, 0, 0],
                distance: 6,
            },
            {
                targetStopId: 'r2c2',
                label: 'South → R2 C2',
                direction: [0, 0, 1],
                distance: 6,
            },
        ],
    },
    {
        id: 'r2c1',
        label: 'R2 C1',
        textureUrl: './panorama/backyard_pano_r2c1.jpg',
        hotspots: [
            {
                targetStopId: 'r1c1',
                label: 'North → R1 C1',
                direction: [0, 0, -1],
                distance: 6,
            },
            {
                targetStopId: 'r2c2',
                label: 'East → R2 C2',
                direction: [1, 0, 0],
                distance: 6,
            },
        ],
    },
    {
        id: 'r2c2',
        label: 'R2 C2',
        textureUrl: './panorama/backyard_pano_r2c2.jpg',
        hotspots: [
            {
                targetStopId: 'r1c2',
                label: 'North → R1 C2',
                direction: [0, 0, -1],
                distance: 6,
            },
            {
                targetStopId: 'r2c1',
                label: 'West → R2 C1',
                direction: [-1, 0, 0],
                distance: 6,
            },
        ],
    },
]

export const stopIndexById = (id: string): number =>
    TOUR_STOPS.findIndex((stop) => stop.id === id)
