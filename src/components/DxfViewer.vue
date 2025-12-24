<template>
<div class="canvasContainer" ref="canvasContainer" @click="onCanvasClick">
    <q-inner-loading :showing="isLoading" color="primary" style="z-index: 10"/>
    <div v-if="progress !== null" class="progress">
        <q-linear-progress color="primary" :indeterminate="progress < 0" :value="progress" />
        <div v-if="progressText !== null" class="progressText">{{progressText}}</div>
    </div>
    <div v-if="error !== null" class="error" :title="error">
        <q-icon name="warning" class="text-red" style="font-size: 4rem;" /> Error occurred: {{error}}
    </div>
</div>
</template>

<script>
import {DxfViewer} from "dxf-viewer"
import * as three from "three"
import DxfViewerWorker from "worker-loader!./DxfViewerWorker"

/** Events: all DxfViewer supported events (see DxfViewer.Subscribe()), prefixed with "dxf-". */
export default {
    name: "DxfViewer",

    props: {
        dxfUrl: {
            default: null
        },
        fonts: {
            default: null
        },
        options: {
            default() {
                return {
                    clearColor: new three.Color("#fff"),
                    autoResize: true,
                    colorCorrection: true,
                    sceneOptions: {
                        wireframeMesh: true
                    }
                }
            }
        },
        activeTool: {
            type: String,
            default: 'select'
        }
    },

    data() {
        return {
            isLoading: false,
            progress: null,
            progressText: null,
            curProgressPhase: null,
            error: null,
            raycaster: null,
            selectedObject: null
        }
    },

    watch: {
        async dxfUrl(dxfUrl) {
            if (dxfUrl !== null) {
                await this.Load(dxfUrl)
            } else {
                this.dxfViewer.Clear()
                this.error = null
                this.isLoading = false
                this.progress = null
            }
        }
    },

    methods: {
        async Load(url) {
            this.isLoading = true
            this.error = null
            try {
                await this.dxfViewer.Load({
                    url,
                    fonts: this.fonts,
                    progressCbk: this._OnProgress.bind(this),
                    workerFactory: DxfViewerWorker
                })
            } catch (error) {
                console.warn(error)
                this.error = error.toString()
            } finally {
                this.isLoading = false
                this.progressText = null
                this.progress = null
                this.curProgressPhase = null
            }
        },

        /** @return {DxfViewer} */
        GetViewer() {
            return this.dxfViewer
        },

        _OnProgress(phase, size, totalSize) {
            if (phase !== this.curProgressPhase) {
                switch(phase) {
                case "font":
                    this.progressText = "Fetching fonts..."
                    break
                case "fetch":
                    this.progressText = "Fetching file..."
                    break
                case "parse":
                    this.progressText = "Parsing file..."
                    break
                case "prepare":
                    this.progressText = "Preparing rendering data..."
                    break
                }
                this.curProgressPhase = phase
            }
            if (totalSize === null) {
                this.progress = -1
            } else {
                this.progress = size / totalSize
            }
        },

        onCanvasClick(event) {
            if (this.activeTool === 'select' || !this.dxfViewer) return

            const rect = this.$refs.canvasContainer.getBoundingClientRect()
            const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
            const y = -((event.clientY - rect.top) / rect.height) * 2 + 1

            if (!this.raycaster) {
                this.raycaster = new three.Raycaster()
                this.raycaster.params.Line.threshold = 2
                this.raycaster.params.Points.threshold = 2
            }

            const camera = this.dxfViewer.GetCamera()
            const scene = this.dxfViewer.GetScene()

            this.raycaster.setFromCamera(new three.Vector2(x, y), camera)
            const intersects = this.raycaster.intersectObjects(scene.children, true)

            if (intersects.length > 0) {
                for (const intersect of intersects) {
                    this.clearSelection()
                    const object = intersect.object

                    try {
                        const dimensions = this.extractDimensions(object, intersect)

                        if (dimensions && this.matchesTool(dimensions.type)) {
                            this.highlightObject(object)
                            this.$emit('entity-selected', dimensions)
                            return
                        }
                    } catch (error) {
                        console.warn('Error extracting dimensions:', error)
                    }
                }
                this.clearSelection()
                this.$emit('entity-selected', null)
            } else {
                this.clearSelection()
                this.$emit('entity-selected', null)
            }
        },

        matchesTool(entityType) {
            if (this.activeTool === 'line' && entityType === 'line') return true
            if (this.activeTool === 'hole' && entityType === 'circle') return true
            if (this.activeTool === 'region' && entityType === 'region') return true
            return false
        },

        extractDimensions(object, intersection) {
            if (!object || !object.geometry) return null

            const geometry = object.geometry
            const userData = object.userData || {}

            if (!geometry.attributes || !geometry.attributes.position) return null

            const positions = geometry.attributes.position.array
            if (!positions || positions.length === 0) return null

            const numVertices = positions.length / 3
            const validPositions = []

            for (let i = 0; i < numVertices; i++) {
                const x = positions[i * 3]
                const y = positions[i * 3 + 1]
                const z = positions[i * 3 + 2] || 0

                if (isFinite(x) && isFinite(y) && isFinite(z)) {
                    validPositions.push({ x, y, z })
                }
            }

            if (validPositions.length === 0) return null

            if (validPositions.length === 2) {
                const start = validPositions[0]
                const end = validPositions[1]
                const dx = end.x - start.x
                const dy = end.y - start.y
                const dz = end.z - start.z
                const length = Math.sqrt(dx * dx + dy * dy + dz * dz)

                if (length > 0) {
                    return {
                        type: 'line',
                        start: { x: start.x, y: start.y },
                        end: { x: end.x, y: end.y },
                        length,
                        layer: userData.layer || 'Unknown',
                        color: '#' + (object.material?.color?.getHexString() || '000000')
                    }
                }
            }

            const xCoords = validPositions.map(p => p.x)
            const yCoords = validPositions.map(p => p.y)

            const minX = Math.min(...xCoords)
            const maxX = Math.max(...xCoords)
            const minY = Math.min(...yCoords)
            const maxY = Math.max(...yCoords)

            const width = maxX - minX
            const height = maxY - minY
            const centerX = (minX + maxX) / 2
            const centerY = (minY + maxY) / 2

            if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) {
                return null
            }

            if (Math.abs(width - height) / Math.max(width, height) < 0.1) {
                const radius = (width + height) / 4
                if (radius > 0) {
                    return {
                        type: 'circle',
                        center: { x: centerX, y: centerY },
                        radius,
                        diameter: radius * 2,
                        circumference: 2 * Math.PI * radius,
                        area: Math.PI * radius * radius,
                        layer: userData.layer || 'Unknown',
                        color: '#' + (object.material?.color?.getHexString() || '000000')
                    }
                }
            }

            if (width > 0 && height > 0 && validPositions.length >= 4) {
                return {
                    type: 'region',
                    width,
                    height,
                    area: width * height,
                    perimeter: 2 * (width + height),
                    center: { x: centerX, y: centerY },
                    layer: userData.layer || 'Unknown',
                    color: '#' + (object.material?.color?.getHexString() || '000000')
                }
            }

            return null
        },

        highlightObject(object) {
            if (!object || !object.material) return

            this.selectedObject = object

            if (!object.userData) {
                object.userData = {}
            }

            if (object.material.color) {
                object.userData.originalColor = object.material.color.clone()
                object.material.color.set(0xff6600)
                object.material.needsUpdate = true
            }

            if (object.material.linewidth !== undefined) {
                object.userData.originalLinewidth = object.material.linewidth
                object.material.linewidth = 3
                object.material.needsUpdate = true
            }
        },

        clearSelection() {
            if (!this.selectedObject) return

            try {
                if (this.selectedObject.material) {
                    if (this.selectedObject.userData?.originalColor) {
                        this.selectedObject.material.color.copy(this.selectedObject.userData.originalColor)
                        delete this.selectedObject.userData.originalColor
                    }
                    if (this.selectedObject.userData?.originalLinewidth !== undefined) {
                        this.selectedObject.material.linewidth = this.selectedObject.userData.originalLinewidth
                        delete this.selectedObject.userData.originalLinewidth
                    }
                    this.selectedObject.material.needsUpdate = true
                }
            } catch (error) {
                console.warn('Error clearing selection:', error)
            }

            this.selectedObject = null
        }
    },

    mounted() {
        this.dxfViewer = new DxfViewer(this.$refs.canvasContainer, this.options)
        const Subscribe = eventName => {
            this.dxfViewer.Subscribe(eventName, e => this.$emit("dxf-" + eventName, e))
        }
        for (const eventName of ["loaded", "cleared", "destroyed", "resized", "pointerdown",
                                 "pointerup", "viewChanged", "message"]) {
            Subscribe(eventName)
        }
    },

    destroyed() {
        this.dxfViewer.Destroy()
        this.dxfViewer = null
    }
}
</script>

<style scoped lang="less">

.canvasContainer {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 100px;
    min-height: 100px;

    .progress {
        position: absolute;
        z-index: 20;
        width: 90%;
        margin: 20px 5%;

        .progressText {
            margin: 10px 20px;
            font-size: 14px;
            color: #262d33;
            text-align: center;
        }
    }

    .error {
        width: 100%;
        height: 100%;
        position: absolute;
        z-index: 20;
        padding: 30px;

        img {
            width: 24px;
            height: 24px;
            vertical-align: middle;
            margin: 4px;
        }
    }
}

</style>
