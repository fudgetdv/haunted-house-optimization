import type { HotspotDef } from './hotspots'

/**
 * Tour stops — equirect / cylindrical panos (VirtualOutside).
 *
 * Compass (north-aligned capture):
 *   north [0,0,-1]  south [0,0,1]  east [1,0,0]  west [-1,0,0]
 * HotspotController mirrors X/Z for inside-view texture.
 *
 * Active tour = TOUR_STOPS (script loads this array only).
 */

export type TourStop = {
    id: string
    label: string
    textureUrl: string
    hotspots: HotspotDef[]
}

/** 2×2 backyard grid (kept for swapping active tour). */
export const TOUR_STOPS_BACKYARD: TourStop[] = [
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

/**
 * Active tour: 1×2 row (r0c0 — r0c1).
 * Files on disk: nusc_pano_r0c0.jpg, panorama_pano_r0c1.jpg
 */
export const TOUR_STOPS: TourStop[] = [
    {
        id: 'r0c0',
        label: 'R0 C0',
        textureUrl: './panorama/nusc_pano_r0c0.jpg',
        hotspots: [
            {
                targetStopId: 'r0c1',
                label: 'East → R0 C1',
                direction: [1, 0, 0],
                distance: 6,
            },
        ],
    },
    {
        id: 'r0c1',
        label: 'R0 C1',
        // On disk: panorama_pano_r0c1.jpg (not backyard_pano_r0c1)
        textureUrl: './panorama/panorama_pano_r0c1.jpg',
        hotspots: [
            {
                targetStopId: 'r0c0',
                label: 'West → R0 C0',
                direction: [-1, 0, 0],
                distance: 6,
            },
        ],
    },
]

/** Resolve hotspot targetStopId → index in the active TOUR_STOPS array. */
export const stopIndexById = (id: string): number =>
    TOUR_STOPS.findIndex((stop) => stop.id === id)
